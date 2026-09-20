/**
 * Profile routes — the "personal work profile" (§28). Profession, skills,
 * prices, geography, goals. This is the context Светлана reasons over, so it
 * lives in the DB (never in model weights).
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow, readJson } from '../lib/http.js';

const profileSchema = z.object({
  display_name: z.string().min(2).max(80).optional(),
  profession: z.string().max(120).nullable().optional(),
  specialization: z.string().max(120).nullable().optional(),
  bio: z.string().max(4000).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  work_geography: z.string().max(500).nullable().optional(),
  schedule: z.string().max(200).nullable().optional(),
  experience_years: z.coerce.number().int().min(0).max(80).nullable().optional(),
  min_hourly_rate: z.coerce.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).default('RUB').optional(),
  goals: z.array(z.string().max(200)).max(20).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  skills: z.array(z.object({ name: z.string().min(1).max(80), level: z.coerce.number().int().min(1).max(5) })).max(40).optional(),
});

export default async function profileRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  fastify.get('/', async (request, reply) => {
    let profile = db().prepare('SELECT * FROM profiles WHERE user_id = ?').get(request.user.id);
    if (!profile) {
      const user = db().prepare('SELECT email FROM users WHERE id = ?').get(request.user.id);
      db()
        .prepare('INSERT INTO profiles (id, user_id, display_name) VALUES (?, ?, ?)')
        .run(nanoid(), request.user.id, user.email.split('@')[0]);
      profile = db().prepare('SELECT * FROM profiles WHERE user_id = ?').get(request.user.id);
    }
    const skills = db()
      .prepare(`SELECT s.name, ps.level FROM profile_skills ps
                JOIN skills s ON s.id = ps.skill_id WHERE ps.profile_id = ?`)
      .all(profile.id);
    reply.send({ ...profile, goals: readJson(profile.goals, []), preferences: readJson(profile.preferences, {}), skills });
  });

  fastify.put('/', async (request, reply) => {
    const body = validateOrThrow(profileSchema, request.body, reply);
    if (!body) return;
    const { skills, ...fields } = body;
    let profile = db().prepare('SELECT * FROM profiles WHERE user_id = ?').get(request.user.id);
    if (!profile) {
      db()
        .prepare('INSERT INTO profiles (id, user_id, display_name) VALUES (?, ?, ?)')
        .run(nanoid(), request.user.id, fields.display_name || 'Профиль');
      profile = db().prepare('SELECT * FROM profiles WHERE user_id = ?').get(request.user.id);
    }
    const cols = ['display_name', 'profession', 'specialization', 'bio', 'city', 'work_geography',
      'schedule', 'experience_years', 'min_hourly_rate', 'currency'];
    const setCols = cols.filter((c) => fields[c] !== undefined);
    const jsonCols = { goals: 'goals', preferences: 'preferences' };

    db().transaction(() => {
      if (setCols.length || Object.keys(jsonCols).some((k) => fields[k] !== undefined)) {
        // Each SET fragment must be "col = ?" — bare column names here produce
        // "syntax error near ','" on every profile save.
        const parts = setCols.map((c) => `${c} = ?`);
        const values = setCols.map((c) => fields[c]);
        for (const [k, col] of Object.entries(jsonCols)) {
          if (fields[k] !== undefined) {
            parts.push(`${col} = ?`);
            values.push(JSON.stringify(fields[k]));
          }
        }
        parts.push('updated_at = unixepoch()');
        db()
          .prepare(`UPDATE profiles SET ${parts.join(', ')} WHERE id = ?`)
          .run(...values, profile.id);
      }
      if (skills) {
        db().prepare('DELETE FROM profile_skills WHERE profile_id = ?').run(profile.id);
        for (const s of skills) {
          db()
            .prepare('INSERT OR IGNORE INTO skills (id, name, slug) VALUES (?, ?, ?)')
            .run(nanoid(), s.name, s.name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-'));
          const row = db().prepare('SELECT id FROM skills WHERE slug = ?').get(s.name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-'));
          if (row) {
            db()
              .prepare('INSERT OR REPLACE INTO profile_skills (profile_id, skill_id, level) VALUES (?, ?, ?)')
              .run(profile.id, row.id, s.level);
          }
        }
      }
    });

    const updated = db().prepare('SELECT * FROM profiles WHERE id = ?').get(profile.id);
    auditRequest(request, 'update', 'profile', profile.id, fields);
    reply.send(updated);
  });
}
