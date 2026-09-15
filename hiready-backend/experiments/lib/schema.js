'use strict';
/**
 * JSON Schema for the résumé-analysis object, for configuration F.
 *
 * Groq exposes constrained decoding through
 *   response_format: { type: 'json_schema', json_schema: { name, schema, strict } }
 * and documents strict mode as giving full schema adherence for
 * openai/gpt-oss-20b, openai/gpt-oss-120b and qwen/qwen3.8-27b.
 *
 * FAIRNESS NOTE. This schema describes exactly the object the prompt-level
 * configurations (A-E) are asked to produce - same fields, same nesting, same
 * enumerations. If it were narrower, configuration F would be solving an easier
 * problem and the comparison would be meaningless. The only difference between
 * F and E is *how* conformance is obtained, not *what* is requested.
 *
 * Strict mode requires every property to appear in `required` and
 * additionalProperties:false at every level, so the schema is written that way
 * throughout even where a field is semantically optional; "not found" is
 * expressed as an empty string or empty array, exactly as the prompt instructs.
 */

const score = { type: 'integer', minimum: 0, maximum: 100 };
const str = { type: 'string' };
const strArray = { type: 'array', items: { type: 'string' } };

function obj(properties) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

const RESUME_ANALYSIS_SCHEMA = obj({
  candidateName: str,
  atsScore: score,
  keywordMatch: score,
  formatScore: score,
  overallScore: score,
  verdict: str,
  targetRole: str,
  experienceLevel: str,
  contactInfo: obj({
    email: str, phone: str, linkedin: str, github: str, portfolio: str
  }),
  extractedSkills: strArray,
  education: strArray,
  certifications: strArray,
  wordCount: { type: 'integer', minimum: 0 },
  missingKeywords: strArray,
  experienceSummary: str,
  experience: {
    type: 'array',
    items: obj({
      company: str, title: str, startDate: str, endDate: str, duration: str
    })
  },
  sections: {
    type: 'array',
    items: obj({
      name: str,
      present: { type: 'boolean' },
      wordCount: { type: 'integer', minimum: 0 },
      score,
      feedback: str
    })
  },
  bulletAnalysis: obj({
    totalBullets: { type: 'integer', minimum: 0 },
    quantifiedBullets: { type: 'integer', minimum: 0 },
    actionVerbScore: score,
    weakPhrases: strArray
  }),
  suggestedBullets: {
    type: 'array',
    items: obj({ original: str, rewritten: str, reason: str })
  },
  strengths: strArray,
  improvements: strArray,
  criticalIssues: strArray,
  skillsDistribution: obj({
    technical: score, softSkills: score, tools: score, languages: score
  })
});

/** The response_format payload for a strict constrained-decoding request. */
function responseFormat(strict = true) {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'resume_analysis',
      schema: RESUME_ANALYSIS_SCHEMA,
      strict
    }
  };
}

module.exports = { RESUME_ANALYSIS_SCHEMA, responseFormat };
