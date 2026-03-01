type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

declare const process: {
  argv: string[];
  cwd(): string;
  exit(code?: number): never;
};

declare function require(moduleName: string): any;

type TaskRecord = {
  id?: string;
  status?: string;
  dependencies?: string[] | null;
  blocked_by?: string | null;
  unblock_plan?: string | null;
  completed_at?: string | null;
  evidence?: string[] | string | null;
  [key: string]: unknown;
};

type ParseResult = {
  tasks: TaskRecord[];
  errors: string[];
};

const ALLOWED_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
]);

const TASK_ID_RE = /^WS-[A-Z]-\d{3}$/;

function parseKeyValue(line: string): { key: string; value: string } | null {
  const index = line.indexOf(':');
  if (index === -1) return null;
  const key = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  return { key, value };
}

function normalizeScalar(value: string): string | string[] | null {
  if (value === 'null' || value === 'None' || value === '~') return null;

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((part) => part.trim());
  }

  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseTasksFromYaml(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const tasks: TaskRecord[] = [];
  const errors: string[] = [];

  let inTasks = false;
  let current: TaskRecord | null = null;
  let currentMultilineListKey: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const stripped = line.trim();

    if (!stripped || stripped.startsWith('#')) continue;

    if (stripped === 'tasks:') {
      inTasks = true;
      current = null;
      currentMultilineListKey = null;
      continue;
    }

    if (!inTasks) continue;

    if (/^-\s+id:\s+/.test(stripped)) {
      if (current) tasks.push(current);
      current = {};
      currentMultilineListKey = null;
      const right = stripped.split('id:')[1] || '';
      current.id = right.trim();
      continue;
    }

    if (!current) continue;

    if (currentMultilineListKey && stripped.startsWith('-')) {
      const item = stripped.slice(1).trim();
      const list = Array.isArray(current[currentMultilineListKey])
        ? (current[currentMultilineListKey] as string[])
        : [];
      list.push(item);
      current[currentMultilineListKey] = list;
      continue;
    }

    const kv = parseKeyValue(stripped);
    if (!kv) continue;

    const { key, value } = kv;
    if (value === '') {
      current[key] = [];
      currentMultilineListKey = key;
      continue;
    }

    current[key] = normalizeScalar(value);
    currentMultilineListKey = null;
  }

  if (current) tasks.push(current);

  if (tasks.length === 0) {
    errors.push("No tasks found under top-level 'tasks:' section.");
  }

  return { tasks, errors };
}

function validateTasks(tasks: TaskRecord[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const task of tasks) {
    const taskId = String(task.id || '').trim();
    const status = String(task.status || '').trim();

    if (!taskId) {
      errors.push('Task missing id.');
      continue;
    }

    if (seenIds.has(taskId)) {
      errors.push(`Duplicate task id: ${taskId}`);
    }
    seenIds.add(taskId);

    if (!TASK_ID_RE.test(taskId)) {
      errors.push(`Invalid task id format: ${taskId} (expected WS-X-000)`);
    }

    if (!ALLOWED_STATUSES.has(status as TaskStatus)) {
      errors.push(`Task ${taskId}: invalid status '${status}'.`);
    }

    let dependencies = task.dependencies || [];
    if (dependencies == null) dependencies = [];
    if (!Array.isArray(dependencies)) {
      errors.push(`Task ${taskId}: dependencies must be a list.`);
      dependencies = [];
    }

    if (status === 'BLOCKED') {
      const blockedBy = task.blocked_by;
      const unblockPlan = task.unblock_plan;
      if (blockedBy == null || blockedBy === '' || blockedBy === 'null') {
        errors.push(`Task ${taskId}: BLOCKED tasks require blocked_by.`);
      }
      if (unblockPlan == null || unblockPlan === '' || unblockPlan === 'null') {
        errors.push(`Task ${taskId}: BLOCKED tasks require unblock_plan.`);
      }
    }

    if (status === 'DONE') {
      const completedAt = task.completed_at;
      const evidence = task.evidence;
      if (completedAt == null || completedAt === '' || completedAt === 'null') {
        errors.push(`Task ${taskId}: DONE tasks require completed_at.`);
      }
      if (
        evidence == null ||
        evidence === '' ||
        evidence === 'null' ||
        (Array.isArray(evidence) && evidence.length === 0)
      ) {
        errors.push(`Task ${taskId}: DONE tasks require evidence.`);
      }
    }
  }

  for (const task of tasks) {
    const taskId = String(task.id || '').trim();
    let dependencies = task.dependencies || [];
    if (dependencies == null) dependencies = [];
    if (Array.isArray(dependencies)) {
      for (const dep of dependencies) {
        const depId = String(dep).trim();
        if (depId && !seenIds.has(depId)) {
          errors.push(`Task ${taskId}: unknown dependency '${depId}'.`);
        }
      }
    }
  }

  return errors;
}

function parseArgs(argv: string[]): { filePath: string } {
  let filePath = 'docs/agent-task-registry.yaml';

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') {
      filePath = argv[i + 1] || filePath;
      i += 1;
    }
  }

  return { filePath };
}

function main(): number {
  const fs = require('fs') as {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: 'utf8'): string;
  };
  const path = require('path') as {
    resolve(...segments: string[]): string;
  };

  const { filePath } = parseArgs(process.argv);
  const resolved = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolved)) {
    console.error(`ERROR: Registry file not found: ${filePath}`);
    return 2;
  }

  const text = fs.readFileSync(resolved, 'utf8');
  const { tasks, errors: parseErrors } = parseTasksFromYaml(text);
  const errors = [...parseErrors, ...validateTasks(tasks)];

  if (errors.length > 0) {
    console.error('VALIDATION FAILED');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  console.log(`VALIDATION PASSED: ${tasks.length} task(s) checked in ${filePath}`);
  return 0;
}

process.exit(main());
