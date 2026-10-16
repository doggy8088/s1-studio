export type QuestionType = 'noul' | 'choice' | 'score';

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: {
    true?: string;
    false?: string;
  };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>; // 順序具意義（影響同分判定），null 代表由鍵名自描述
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[]; // 至少 2 個元素，由低到高排列
}

export type S1Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface S1RequestPayload {
  model?: string;
  state: string | Record<string, unknown> | unknown[];
  images?: string[]; // Raw base64 strings (不含 data URI prefix)
  questions: Record<string, S1Question>;
}

export interface NoulResult {
  type?: 'noul';
  noul: number; // 0.0 ~ 1.0
}

export interface ChoiceResult {
  type?: 'choice';
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface ScoreResult {
  type?: 'score';
  score: number; // 0.0 ~ 1.0 (or weighted index)
  confidence: number;
  legend?: Record<string, string>;
  probabilities?: number[] | Record<string, number>;
}

export type S1AnswerItem = NoulResult | ChoiceResult | ScoreResult;

export interface S1ResponsePayload {
  model?: string;
  // Raw HTTP API format returned by Ollama /v1/systemone (clef / clef-flash) & TypeSafe Jev
  answers?: Record<string, S1AnswerItem>;
  // Grouped format (also normalized by S1 Studio client so both formats work seamlessly)
  nouls?: Record<string, NoulResult>;
  choices?: Record<string, ChoiceResult>;
  scores?: Record<string, ScoreResult>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface EndpointProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  useProxy: boolean;
}

// ---------------------------------------------------------------------------
// Extended UI Builder & Persistence Types
// ---------------------------------------------------------------------------

export interface ChoiceCriterionItem {
  id: string;
  key: string;
  description: string;
}

export interface ScoreCriterionItem {
  id: string;
  label: string;
}

export interface QuestionBuilderItem {
  id: string;
  key: string;
  type: QuestionType;
  instructions: string;
  choiceCriteria: ChoiceCriterionItem[];
  scoreCriteria: ScoreCriterionItem[];
}

export interface UploadedImageItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  rawBase64: string; // Stripped of data:image/...;base64,
  previewDataUrl: string;
}

export interface ExecutionRunMeta {
  profileId: string;
  profileName: string;
  model: string;
  status: number;
  statusText: string;
  latencyMs: number;
  response?: S1ResponsePayload;
  rawResponseText?: string;
  error?: string;
  timestamp: number;
}

export interface S1PresetDefinition {
  id: string;
  name: string;
  description: string;
  category: 'support' | 'security' | 'multimodal' | 'agent' | 'custom';
  stateMode: 'text' | 'json';
  stateText: string;
  images?: UploadedImageItem[];
  questions: Record<string, S1Question>;
  createdAt: number;
  isBuiltIn?: boolean;
}

export interface S1HistoryEntry {
  id?: number;
  timestamp: number;
  profileName: string;
  model: string;
  stateMode: 'text' | 'json';
  stateText: string;
  imagesCount: number;
  requestPayload: S1RequestPayload;
  primaryRun: ExecutionRunMeta;
  compareRun?: ExecutionRunMeta;
}

export interface S1ExportFileFormat {
  version: '1.0';
  exportedAt: string;
  name: string;
  description?: string;
  stateMode: 'text' | 'json';
  stateText: string;
  payload: S1RequestPayload;
}
