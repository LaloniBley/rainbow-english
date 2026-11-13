// ---------- Контент модуля (module.json) ----------

export type Skill = 'listening' | 'reading' | 'writing' | 'vocab' | 'grammar' | 'speaking'

export interface Source {
  book: 'sb1' | 'sb2' | 'wb' | 'test'
  page?: number
  ex?: string | number
}

export interface ExBase {
  id: string
  type: string
  instruction: string
  skill: Skill
  source?: Source
  img?: string
  images?: string[]
  /** путь к аудио внутри модуля, массив путей или "tts" */
  audio?: string | string[]
  /** аудио «Проверь себя» — показывается после ответа */
  checkAudio?: string | string[]
  note?: string
  /** ответы без ключа: идут в отчёт с пометкой «проверь сам» */
  teacher?: boolean
  /** образец ответа для кнопки «Показать ответ» (для заданий без автопроверки) */
  answerKey?: string[]
}

export interface ListenRepeatEx extends ExBase {
  type: 'listen_repeat'
  lines?: string[]
  /** у строк есть кнопка озвучки синтезатором */
  ttsLines?: boolean
}

export interface InfoEx extends ExBase {
  type: 'info'
  text: string
}

export interface ChooseItem {
  id: string
  prompt?: string
  img?: string
  options: string[]
  answer?: string[]
  multi?: boolean
}
export interface ChooseEx extends ExBase {
  type: 'choose'
  items: ChooseItem[]
  /** любой выбор засчитывается (личное мнение) */
  free?: boolean
}

export interface MatchPair {
  id: string
  left: string
  right: string
  leftImg?: string
  rightImg?: string
}
export interface MatchEx extends ExBase {
  type: 'match'
  pairs: MatchPair[]
  leftTitle?: string
  rightTitle?: string
}

export interface GapItem {
  id: string
  img?: string
  prompt?: string
  /** текст с пропусками: {ответ|вариант} или {re:регулярка} */
  text: string
}
export interface GapEx extends ExBase {
  type: 'gap'
  items: GapItem[]
  caseSensitive?: boolean
  inline?: boolean
}

export interface CopyLine {
  id: string
  sample: string
}
export interface CopyEx extends ExBase {
  type: 'copy'
  lines: CopyLine[]
  times?: number
}

export interface OrderItem {
  id: string
  label: string
  /** номер, уже проставленный в книге */
  fixed?: number
}
export interface OrderEx extends ExBase {
  type: 'order'
  items: OrderItem[]
  /** id в правильном порядке, если известен */
  answer?: string[]
}

export interface SortEx extends ExBase {
  type: 'sort'
  buckets: { id: string; label: string }[]
  words: { id: string; text: string; bucket: string }[]
}

export interface WordSetEx extends ExBase {
  type: 'word_set'
  count: number
  accept: string[]
  grid?: string[]
  example?: string
}

export interface FreeItem {
  id: string
  prompt: string
  img?: string
  options?: string[]
}
export interface FreeEx extends ExBase {
  type: 'free'
  items: FreeItem[]
}

export type Exercise =
  | ListenRepeatEx
  | InfoEx
  | ChooseEx
  | MatchEx
  | GapEx
  | CopyEx
  | OrderEx
  | SortEx
  | WordSetEx
  | FreeEx

export interface VocabWord {
  id: string
  en: string
  ru?: string
  tr?: string
  img?: string
  audio?: string
  /** имя собственное: без перевода, в диктанте только на слух */
  name?: boolean
}

export interface Step {
  id: string
  number: number
  title: string
  summingUp?: boolean
  note?: string
  vocab: VocabWord[]
  /** формат диктанта по словам ЭТОГО степа (проводится перед следующим) */
  dictationMode?: 'write' | 'choose'
  skills?: string[]
  together: Exercise[]
  self: Exercise[]
}

export interface TestVariant {
  id: string
  exercises: Exercise[]
  points?: Record<string, number>
}

export interface Test {
  id: string
  kind: 'block' | 'half' | 'year'
  title: string
  minutes: number
  variants: TestVariant[]
}

export interface Grading {
  five: number
  four: number
  three: number
}

export interface Module {
  id: string
  version: number
  number: number
  title: string
  color: string
  steps: Step[]
  tests: Test[]
  grading?: Grading
  notes?: Record<string, string>
}

// ---------- Прогресс (IndexedDB) ----------

export interface FieldResult {
  key: string
  label: string
  given: string
  expected?: string
  /** null — без ключа */
  correct: boolean | null
  firstTry: boolean | null
  /** частичный зачёт 0..1 (несколько ответов в одном вопросе) */
  part?: number
  partFirst?: number
}

export interface ExResult {
  exId: string
  moduleId: string
  stepId?: string
  testSessionId?: string
  fields: FieldResult[]
  /** 0..1 по первым попыткам; null если нечего считать */
  scoreFirst: number | null
  scoreFinal: number | null
  selfMark?: 'ok' | 'errors'
  listens: number
  startedAt: number
  finishedAt: number
  teacher: boolean
}

export interface DictationWord {
  wordKey: string
  en: string
  kind: 'audio' | 'picture' | 'ru' | 'choose'
  typed: string
  correct: boolean
}

export interface DictationResult {
  id: string
  moduleId: string
  stepId: string
  date: number
  words: DictationWord[]
  score: number
  retryScore?: number
}

export interface WordState {
  box: number
  seen: number
  errors: number
  lastSeen: number
}

export interface TestSession {
  id: string
  moduleId: string
  testId: string
  variant: number
  startedAt: number
  deadline: number
  submittedAt?: number
  autoSubmitted?: boolean
  focusLost: number
  answers: Record<string, Record<string, unknown>>
  results?: ExResult[]
  points?: number
  maxPoints?: number
  percent?: number
  grade?: number
  timePerEx: Record<string, number>
}

export interface StepState {
  startedAt?: number
  completedAt?: number
  dictationDone?: boolean
  timeMs: number
  /** начало повторного прохождения степа */
  retakeAt?: number
}

export interface OutboxItem {
  id: string
  subject: string
  message: string
  createdAt: number
  tries: number
  sentAt?: number
  error?: string
}

export interface Progress {
  version: 1
  results: Record<string, ExResult[]>
  steps: Record<string, StepState>
  dictations: DictationResult[]
  words: Record<string, WordState>
  tests: TestSession[]
  activity: Record<string, number>
  achievements: Record<string, number>
  outbox: OutboxItem[]
  drafts: Record<string, Record<string, unknown>>
  settings: { sound: boolean; authorMode: boolean; name?: string }
}

export interface AppConfig {
  studentName?: string
  web3formsKey?: string
}
