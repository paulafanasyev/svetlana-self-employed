/**
 * Catalog of local AI models the user may download inside «Светлана» (PC and phone).
 * Agreed by the licensing / performance / product review on 2026-10-11: only models whose
 * license allows commercial use. Excluded on purpose: Qwen-Image-2.1 (+Turbo) — Qwen Research
 * License, non-commercial; Qwen2.5-VL-3B — Qwen Research License; Silero v5_ru — CC BY-NC;
 * XTTS-v2 — CPML; Piper «irina» — unknown dataset license; heavy image generators (not needed).
 * The apps download only from the listed source and verify size/sha256 from their own pinned copy.
 */
export const MODEL_CATALOG = Object.freeze({
  version: '2026-10-11',
  models: [
    { id: 'qwen3-4b-q4km', category: 'chat', platforms: ['windows'], tier: 'default', source: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF', size_mb: 2500, license: 'Apache-2.0', runtime: 'llama.cpp / Ollama', note: 'Основной ассистент на ПК (16 ГБ ОЗУ)' },
    { id: 't-lite-it-2.1-q4km', category: 'chat', platforms: ['windows'], tier: 'optional', source: 'https://huggingface.co/t-tech/T-lite-it-2.1-GGUF', size_mb: 5000, license: 'Apache-2.0', runtime: 'llama.cpp', note: 'Лучше по-русски и с инструментами' },
    { id: 'gigachat3.1-10b-a1.8b-q4km', category: 'chat', platforms: ['windows'], tier: 'optional', source: 'https://huggingface.co/ai-sage/GigaChat3.1-10B-A1.8B-GGUF', size_mb: 6470, license: 'MIT', runtime: 'llama.cpp', note: 'Для мощных ПК' },
    { id: 'qwen3-0.6b-litert', category: 'chat', platforms: ['android'], tier: 'default', source: 'https://huggingface.co/litert-community/Qwen3-0.6B', size_mb: 586, license: 'Apache-2.0', runtime: 'LiteRT-LM', note: 'Короткие ответы офлайн' },
    { id: 'qwen3-1.7b-q4km', category: 'chat', platforms: ['android'], tier: 'optional', source: 'https://huggingface.co/second-state/Qwen3-1.7B-GGUF', size_mb: 1280, license: 'Apache-2.0', runtime: 'llama.cpp', note: 'Телефоны от 6–8 ГБ ОЗУ' },
    { id: 'multilingual-e5-small', category: 'embeddings', platforms: ['windows', 'android'], tier: 'default', source: 'https://huggingface.co/intfloat/multilingual-e5-small', size_mb: 120, license: 'MIT', runtime: 'ONNX Runtime', note: 'Поиск по своим документам' },
    { id: 'bge-m3', category: 'embeddings', platforms: ['windows'], tier: 'optional', source: 'https://huggingface.co/BAAI/bge-m3', size_mb: 1100, license: 'MIT', runtime: 'ONNX Runtime', note: 'Длинные документы' },
    { id: 'gigaam-v3', category: 'stt', platforms: ['windows'], tier: 'default', source: 'https://huggingface.co/ai-sage/GigaAM-v3', size_mb: 450, license: 'MIT', runtime: 'ONNX', note: 'Распознавание русской речи офлайн' },
    { id: 'vosk-small-ru', category: 'stt', platforms: ['android'], tier: 'default', source: 'https://huggingface.co/alphacep/vosk-model-small-ru', size_mb: 45, license: 'Apache-2.0', runtime: 'Vosk / sherpa-onnx', note: 'Потоковое распознавание на телефоне' },
    { id: 'whisper-small', category: 'stt', platforms: ['windows', 'android'], tier: 'optional', source: 'https://huggingface.co/openai/whisper-small', size_mb: 500, license: 'MIT', runtime: 'whisper.cpp', note: 'Многоязычное распознавание' },
    { id: 'campplus-sv', category: 'speaker_verification', platforms: ['windows', 'android'], tier: 'default', source: 'https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models', size_mb: 27, license: 'Apache-2.0', runtime: 'sherpa-onnx', note: 'Проверка голоса владельца' },
    { id: 'silero-v5-cis-base', category: 'tts', platforms: ['windows', 'android'], tier: 'default', source: 'https://github.com/snakers4/silero-models', size_mb: 100, license: 'MIT (cis_base)', runtime: 'ONNX', note: 'Голос Светланы офлайн' },
    { id: 'pp-ocrv5-cyrillic-mobile', category: 'ocr', platforms: ['windows', 'android'], tier: 'default', source: 'https://huggingface.co/PaddlePaddle/cyrillic_PP-OCRv5_mobile_rec', size_mb: 20, license: 'Apache-2.0', runtime: 'PaddleOCR / ONNX', note: 'Чеки и документы' },
  ],
  excluded: [
    { id: 'qwen-image-2.1', reason: 'Qwen Research License: только некоммерческое использование; для чеков нужен OCR, а не генерация картинок' },
    { id: 'qwen-image-2.1-turbo', reason: 'Та же некоммерческая лицензия' },
    { id: 'qwen2.5-vl-3b', reason: 'Qwen Research License (некоммерческая)' },
    { id: 'silero-v5-ru', reason: 'CC BY-NC (некоммерческая)' },
    { id: 'xtts-v2', reason: 'CPML (некоммерческая)' },
    { id: 'piper-ru-irina', reason: 'Лицензия датасета неизвестна' },
  ],
});
