/**
 * Shared domain constants — single source of truth for enums that were
 * previously duplicated across route files and drifting out of sync.
 */

// Aptitude / coding question difficulty ladder (index == DIFFICULTY_ORDER value)
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// Stable ordering so "easy" sorts before "medium" before "hard"
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 };

// Languages the code sandbox can compile & run
const CODING_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'go', 'cpp', 'rust'];

// Aptitude question categories accepted by the AI question writer / drafts
const APTITUDE_CATEGORIES = ['logical', 'verbal', 'quant', 'technical', 'general'];

module.exports = { DIFFICULTIES, DIFFICULTY_ORDER, CODING_LANGUAGES, APTITUDE_CATEGORIES };