/**
 * Registry entry point. Importing this module registers every tool — the
 * orchestrator never exposes capabilities that aren't defined here.
 */
import './crm.js';
import './tasks.js';
import './calendar.js';
import './documents.js';
import './search.js';

export { listTools, getTool, toolsForLLM, runTool } from './registry.js';
