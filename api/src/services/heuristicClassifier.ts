/**
 * Fast heuristic task classifier — replaces the LLM-based classifyTask()
 * for the model routing proxy. Runs in < 1ms using keyword/pattern matching.
 *
 * Scoring dimensions (inspired by ibl.ai's 14-dimension approach):
 *   code presence, technical depth, message length, greeting patterns,
 *   research markers, math/reasoning markers, vision flags, internet needs.
 *
 * Output: TaskClassification compatible with smartRouter.ts selectModel().
 */
import { TaskClassification, TaskComplexity } from '../types';

const CODE_KEYWORDS = /\b(function|class|import|export|const|let|var|def|return|async|await|interface|type |enum |npm|yarn|pip|git |docker|kubectl|sql|SELECT|INSERT|UPDATE|CREATE|ALTER|DROP|DELETE FROM|fetch\(|require\(|module\.exports)\b|```|<\/?[a-z]+[\s>]|=>|&&|\|\||!==|===|\bif\s*\(|\bfor\s*\(|\bwhile\s*\(/i;

const SIMPLE_GREETINGS = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|sure|yes|no|bye|goodbye|good morning|good evening|good night|what'?s up|how are you|how'?s it going)[!?.]*$/i;

const ANALYSIS_KEYWORDS = /\b(explain|analyze|analyse|compare|contrast|evaluate|assess|review|summarize|summarise|critique|investigate|research|deep dive|pros and cons|trade-?offs?|advantages|disadvantages|implications|consequences)\b/i;

const REASONING_KEYWORDS = /\b(prove|derive|calculate|compute|solve|equation|theorem|hypothesis|algorithm|complexity|O\(|log\(|mathematical|probability|statistical|regression|derivative|integral|optimize|optimise|NP-hard|recursion|induction)\b/i;

const INTERNET_KEYWORDS = /\b(latest|current|today|recent|news|weather|stock price|live|real-?time|trending|what happened|search for|look up|find out|2025|2026|browse|website|url|http|www\.)\b/i;

const BUILD_KEYWORDS = /\b(build|create|make|develop|implement|code|write|generate|scaffold|setup|set up|deploy|configure|install|refactor|debug|fix the|fix this|fix my|solve this|program|application|app|website|api|server|database|frontend|backend|fullstack|full-stack|component|module|library|framework|script|bot|cli|tool|service|microservice)\b/i;

export function classifyTaskHeuristic(
  message: string,
  hasImage = false
): TaskClassification {
  const msg = message.trim();
  const len = msg.length;

  const hasCode = CODE_KEYWORDS.test(msg);
  const isGreeting = SIMPLE_GREETINGS.test(msg);
  const hasAnalysis = ANALYSIS_KEYWORDS.test(msg);
  const hasReasoning = REASONING_KEYWORDS.test(msg);
  const hasInternet = INTERNET_KEYWORDS.test(msg);
  const hasBuild = BUILD_KEYWORDS.test(msg);
  const hasCodeBlock = msg.includes('```');
  const lineCount = msg.split('\n').length;

  let complexity: TaskComplexity = 'medium';
  let needsCode = false;
  let needsDeepAnalysis = false;
  let needsInternet = hasInternet;
  let needsVision = hasImage;

  if (isGreeting || (len < 40 && !hasCode && !hasAnalysis && !hasBuild)) {
    complexity = 'simple';
  } else if (hasCode || hasCodeBlock || hasBuild) {
    needsCode = true;
    complexity = (len > 500 || lineCount > 10 || hasCodeBlock) ? 'complex' : 'medium';
  } else if (hasReasoning) {
    needsDeepAnalysis = true;
    complexity = 'complex';
  } else if (hasAnalysis) {
    needsDeepAnalysis = len > 200;
    complexity = len > 300 ? 'complex' : 'medium';
  } else if (len > 1000 || lineCount > 20) {
    complexity = 'complex';
    needsDeepAnalysis = true;
  }

  const estimatedTokens = Math.max(200, Math.round(len / 3.5) + 500);

  return {
    needsInternet,
    needsVision,
    needsDeepAnalysis,
    needsCode,
    complexity,
    estimatedTokens,
  };
}
