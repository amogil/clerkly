// Command parser and executor for AI agent

export interface ParsedCommand {
  action: 'create' | 'add' | 'update' | 'delete' | 'show' | 'navigate' | 'unknown';
  entity: 'project' | 'task' | 'contact' | 'meeting' | 'screen' | 'unknown';
  params: Record<string, any>;
}

export function parseCommand(input: string): ParsedCommand {
  const lower = input.toLowerCase();

  // Navigation commands
  if (lower.includes('открой') || lower.includes('покажи') || lower.includes('перейди')) {
    if (lower.includes('dashboard') || lower.includes('главная')) {
      return { action: 'navigate', entity: 'screen', params: { screen: 'dashboard' } };
    }
    if (lower.includes('calendar') || lower.includes('календарь')) {
      return { action: 'navigate', entity: 'screen', params: { screen: 'calendar' } };
    }
    if (lower.includes('tasks') || lower.includes('задачи') || lower.includes('проекты')) {
      return { action: 'navigate', entity: 'screen', params: { screen: 'tasks' } };
    }
    if (lower.includes('contacts') || lower.includes('контакты')) {
      return { action: 'navigate', entity: 'screen', params: { screen: 'contacts' } };
    }
    if (lower.includes('settings') || lower.includes('настройки')) {
      return { action: 'navigate', entity: 'screen', params: { screen: 'settings' } };
    }
  }

  // Create project
  if (
    (lower.includes('создай проект') || lower.includes('create project')) &&
    !lower.includes('задач')
  ) {
    const name = extractName(input, ['создай проект', 'create project']);
    return { action: 'create', entity: 'project', params: { name } };
  }

  // Create task
  if (
    lower.includes('создай задачу') ||
    lower.includes('добавь задачу') ||
    lower.includes('create task') ||
    lower.includes('add task')
  ) {
    const name = extractName(input, ['создай задачу', 'добавь задачу', 'create task', 'add task']);
    const projectName = extractProjectName(input);
    return { action: 'create', entity: 'task', params: { name, projectName } };
  }

  // Add contact
  if (
    lower.includes('добавь контакт') ||
    lower.includes('создай контакт') ||
    lower.includes('add contact') ||
    lower.includes('create contact')
  ) {
    const name = extractName(input, [
      'добавь контакт',
      'создай контакт',
      'add contact',
      'create contact',
    ]);
    return { action: 'create', entity: 'contact', params: { name } };
  }

  // Show tasks/projects
  if (lower.includes('покажи задачи') || lower.includes('show tasks')) {
    return { action: 'show', entity: 'task', params: {} };
  }

  return { action: 'unknown', entity: 'unknown', params: {} };
}

function extractName(input: string, triggers: string[]): string {
  let cleanInput = input;
  for (const trigger of triggers) {
    cleanInput = cleanInput.toLowerCase().replace(trigger.toLowerCase(), '').trim();
  }

  // Remove project references
  cleanInput = cleanInput.replace(/в проект[е]?\s+.+$/i, '').trim();
  cleanInput = cleanInput.replace(/in project\s+.+$/i, '').trim();

  // Remove quotes
  cleanInput = cleanInput.replace(/["«»"]/g, '').trim();

  return cleanInput || 'Untitled';
}

function extractProjectName(input: string): string | undefined {
  const projectMatch =
    input.match(/в проект[е]?\s+["«»"]?([^"«»"]+)["«»"]?/i) ||
    input.match(/in project\s+[""]?([^""]+)[""]?/i);
  return projectMatch ? projectMatch[1].trim() : undefined;
}

export function generateResponse(command: ParsedCommand, success: boolean = true): string {
  if (!success) {
    return '❌ Не удалось выполнить команду. Попробуйте еще раз.';
  }

  switch (command.action) {
    case 'navigate': {
      const screenNames: Record<string, string> = {
        dashboard: 'Dashboard',
        calendar: 'Calendar',
        tasks: 'Tasks',
        contacts: 'Contacts',
        settings: 'Settings',
      };
      return `✓ Перешел на экран ${screenNames[command.params.screen] || command.params.screen}`;
    }

    case 'create':
      if (command.entity === 'project') {
        return `✓ Проект "${command.params.name}" создан! Теперь можете добавлять в него задачи.`;
      }
      if (command.entity === 'task') {
        const projectInfo = command.params.projectName
          ? ` в проект "${command.params.projectName}"`
          : '';
        return `✓ Задача "${command.params.name}" добавлена${projectInfo}!`;
      }
      if (command.entity === 'contact') {
        return `✓ Контакт "${command.params.name}" добавлен в базу!`;
      }
      return '✓ Создано!';

    case 'show':
      if (command.entity === 'task') {
        return '✓ Показываю список задач...';
      }
      return '✓ Показываю...';

    case 'unknown':
      return 'Я не понял команду. Попробуйте:\n• "Создай проект [название]"\n• "Добавь задачу [название] в проект [проект]"\n• "Добавь контакт [имя]"\n• "Открой [раздел]"';

    default:
      return '✓ Выполнено!';
  }
}
