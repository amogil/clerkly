// Requirements: clerkly.1, clerkly.2

import { parseCommand, generateResponse } from '../../../src/renderer/utils/command-parser';

describe('Command Parser', () => {
  describe('parseCommand', () => {
    describe('Navigation Commands', () => {
      /* Preconditions: User enters navigation command in Russian
         Action: Parse "открой dashboard" command
         Assertions: Returns navigate action with screen: dashboard
         Requirements: clerkly.1 */
      it('should parse "открой dashboard" command', () => {
        const result = parseCommand('открой dashboard');

        expect(result.action).toBe('navigate');
        expect(result.entity).toBe('screen');
        expect(result.params.screen).toBe('dashboard');
      });

      /* Preconditions: User enters navigation command in Russian
         Action: Parse "покажи календарь" command
         Assertions: Returns navigate action with screen: calendar
         Requirements: clerkly.1 */
      it('should parse "покажи календарь" command', () => {
        const result = parseCommand('покажи календарь');

        expect(result.action).toBe('navigate');
        expect(result.entity).toBe('screen');
        expect(result.params.screen).toBe('calendar');
      });

      /* Preconditions: User enters navigation command in English
         Action: Parse "open tasks" command
         Assertions: Returns navigate action with screen: tasks
         Requirements: clerkly.1 */
      it('should parse "open tasks" command', () => {
        const result = parseCommand('открой tasks');

        expect(result.action).toBe('navigate');
        expect(result.entity).toBe('screen');
        expect(result.params.screen).toBe('tasks');
      });

      /* Preconditions: User enters navigation command
         Action: Parse "перейди контакты" command
         Assertions: Returns navigate action with screen: contacts
         Requirements: clerkly.1 */
      it('should parse "перейди контакты" command', () => {
        const result = parseCommand('перейди контакты');

        expect(result.action).toBe('navigate');
        expect(result.entity).toBe('screen');
        expect(result.params.screen).toBe('contacts');
      });

      /* Preconditions: User enters navigation command
         Action: Parse "открой settings" command
         Assertions: Returns navigate action with screen: settings
         Requirements: clerkly.1 */
      it('should parse "открой settings" command', () => {
        const result = parseCommand('открой settings');

        expect(result.action).toBe('navigate');
        expect(result.entity).toBe('screen');
        expect(result.params.screen).toBe('settings');
      });

      /* Preconditions: User enters navigation command with mixed case
         Action: Parse "ОТКРОЙ ГЛАВНАЯ" command
         Assertions: Returns navigate action with screen: dashboard (case insensitive)
         Requirements: clerkly.1 */
      it('should handle case insensitive navigation', () => {
        const result = parseCommand('ОТКРОЙ ГЛАВНАЯ');

        expect(result.action).toBe('navigate');
        expect(result.entity).toBe('screen');
        expect(result.params.screen).toBe('dashboard');
      });
    });

    describe('Create Project Commands', () => {
      /* Preconditions: User enters create project command in Russian
         Action: Parse "создай проект Website Redesign" command
         Assertions: Returns create action with entity: project and name in lowercase
         Requirements: clerkly.1 */
      it('should parse "создай проект [name]" command', () => {
        const result = parseCommand('создай проект Website Redesign');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('project');
        expect(result.params.name).toBe('website redesign');
      });

      /* Preconditions: User enters create project command in English
         Action: Parse "create project Mobile App" command
         Assertions: Returns create action with entity: project and name in lowercase
         Requirements: clerkly.1 */
      it('should parse "create project [name]" command', () => {
        const result = parseCommand('create project Mobile App');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('project');
        expect(result.params.name).toBe('mobile app');
      });

      /* Preconditions: User enters create project command without name
         Action: Parse "создай проект" command
         Assertions: Returns create action with default name "Untitled"
         Requirements: clerkly.1 */
      it('should handle create project without name', () => {
        const result = parseCommand('создай проект');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('project');
        expect(result.params.name).toBe('Untitled');
      });

      /* Preconditions: User enters create project command with quotes
         Action: Parse 'создай проект "New Project"' command
         Assertions: Returns create action with name without quotes in lowercase
         Requirements: clerkly.1 */
      it('should remove quotes from project name', () => {
        const result = parseCommand('создай проект "New Project"');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('project');
        expect(result.params.name).toBe('new project');
      });
    });

    describe('Create Task Commands', () => {
      /* Preconditions: User enters create task command
         Action: Parse "создай задачу Fix bug" command
         Assertions: Returns create action with entity: task and name in lowercase
         Requirements: clerkly.1 */
      it('should parse "создай задачу [name]" command', () => {
        const result = parseCommand('создай задачу Fix bug');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('task');
        expect(result.params.name).toBe('fix bug');
        expect(result.params.projectName).toBeUndefined();
      });

      /* Preconditions: User enters create task command with project
         Action: Parse "добавь задачу Update docs в проект Website" command
         Assertions: Returns create action with task name in lowercase and project name
         Requirements: clerkly.1 */
      it('should parse "добавь задачу [name] в проект [project]" command', () => {
        const result = parseCommand('добавь задачу Update docs в проект Website');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('task');
        expect(result.params.name).toBe('update docs');
        expect(result.params.projectName).toBe('Website');
      });

      /* Preconditions: User enters create task command in English
         Action: Parse "create task Review code in project Backend" command
         Assertions: Returns create action with task name in lowercase and project name
         Requirements: clerkly.1 */
      it('should parse "create task [name] in project [project]" command', () => {
        const result = parseCommand('create task Review code in project Backend');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('task');
        expect(result.params.name).toBe('review code');
        expect(result.params.projectName).toBe('Backend');
      });

      /* Preconditions: User enters add task command
         Action: Parse "add task Write tests" command
         Assertions: Returns create action with entity: task and name in lowercase
         Requirements: clerkly.1 */
      it('should parse "add task [name]" command', () => {
        const result = parseCommand('add task Write tests');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('task');
        expect(result.params.name).toBe('write tests');
      });

      /* Preconditions: User enters create task command with project in quotes
         Action: Parse 'создай задачу Fix bug в проект "My Project"' command
         Assertions: Returns create action with task name in lowercase and project name without quotes
         Requirements: clerkly.1 */
      it('should handle project name with quotes', () => {
        const result = parseCommand('создай задачу Fix bug в проект "My Project"');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('task');
        expect(result.params.name).toBe('fix bug');
        expect(result.params.projectName).toBe('My Project');
      });

      /* Preconditions: User enters create task command without name
         Action: Parse "создай задачу" command
         Assertions: Returns create action with default name "Untitled"
         Requirements: clerkly.1 */
      it('should handle create task without name', () => {
        const result = parseCommand('создай задачу');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('task');
        expect(result.params.name).toBe('Untitled');
      });
    });

    describe('Create Contact Commands', () => {
      /* Preconditions: User enters add contact command
         Action: Parse "добавь контакт John Doe" command
         Assertions: Returns create action with entity: contact and name in lowercase
         Requirements: clerkly.1 */
      it('should parse "добавь контакт [name]" command', () => {
        const result = parseCommand('добавь контакт John Doe');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('contact');
        expect(result.params.name).toBe('john doe');
      });

      /* Preconditions: User enters create contact command
         Action: Parse "создай контакт Jane Smith" command
         Assertions: Returns create action with entity: contact and name in lowercase
         Requirements: clerkly.1 */
      it('should parse "создай контакт [name]" command', () => {
        const result = parseCommand('создай контакт Jane Smith');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('contact');
        expect(result.params.name).toBe('jane smith');
      });

      /* Preconditions: User enters add contact command in English
         Action: Parse "add contact Bob Wilson" command
         Assertions: Returns create action with entity: contact and name in lowercase
         Requirements: clerkly.1 */
      it('should parse "add contact [name]" command', () => {
        const result = parseCommand('add contact Bob Wilson');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('contact');
        expect(result.params.name).toBe('bob wilson');
      });

      /* Preconditions: User enters create contact command in English
         Action: Parse "create contact Alice Brown" command
         Assertions: Returns create action with entity: contact and name in lowercase
         Requirements: clerkly.1 */
      it('should parse "create contact [name]" command', () => {
        const result = parseCommand('create contact Alice Brown');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('contact');
        expect(result.params.name).toBe('alice brown');
      });

      /* Preconditions: User enters add contact command without name
         Action: Parse "добавь контакт" command
         Assertions: Returns create action with default name "Untitled"
         Requirements: clerkly.1 */
      it('should handle add contact without name', () => {
        const result = parseCommand('добавь контакт');

        expect(result.action).toBe('create');
        expect(result.entity).toBe('contact');
        expect(result.params.name).toBe('Untitled');
      });
    });

    describe('Show Commands', () => {
      /* Preconditions: User enters show tasks command
         Action: Parse "покажи задачи" command
         Assertions: Returns navigate action to tasks screen (покажи is treated as navigation)
         Requirements: clerkly.1 */
      it('should parse "покажи задачи" command', () => {
        const result = parseCommand('покажи задачи');

        expect(result.action).toBe('navigate');
        expect(result.entity).toBe('screen');
        expect(result.params).toEqual({ screen: 'tasks' });
      });

      /* Preconditions: User enters show tasks command in English
         Action: Parse "show tasks" command
         Assertions: Returns show action with entity: task
         Requirements: clerkly.1 */
      it('should parse "show tasks" command', () => {
        const result = parseCommand('show tasks');

        expect(result.action).toBe('show');
        expect(result.entity).toBe('task');
        expect(result.params).toEqual({});
      });
    });

    describe('Unknown Commands', () => {
      /* Preconditions: User enters unrecognized command
         Action: Parse "random text" command
         Assertions: Returns unknown action and entity
         Requirements: clerkly.1 */
      it('should return unknown for unrecognized commands', () => {
        const result = parseCommand('random text that is not a command');

        expect(result.action).toBe('unknown');
        expect(result.entity).toBe('unknown');
        expect(result.params).toEqual({});
      });

      /* Preconditions: User enters empty command
         Action: Parse "" command
         Assertions: Returns unknown action and entity
         Requirements: clerkly.1 */
      it('should handle empty command', () => {
        const result = parseCommand('');

        expect(result.action).toBe('unknown');
        expect(result.entity).toBe('unknown');
        expect(result.params).toEqual({});
      });
    });
  });

  describe('generateResponse', () => {
    /* Preconditions: Command parsed successfully with navigate action
       Action: Generate response for navigate to dashboard
       Assertions: Returns success message with screen name
       Requirements: clerkly.1 */
    it('should generate response for navigate command', () => {
      const command = {
        action: 'navigate' as const,
        entity: 'screen' as const,
        params: { screen: 'dashboard' },
      };
      const response = generateResponse(command);

      expect(response).toContain('✓');
      expect(response).toContain('Dashboard');
    });

    /* Preconditions: Command parsed successfully with create project action
       Action: Generate response for create project
       Assertions: Returns success message with project name
       Requirements: clerkly.1 */
    it('should generate response for create project command', () => {
      const command = {
        action: 'create' as const,
        entity: 'project' as const,
        params: { name: 'Website' },
      };
      const response = generateResponse(command);

      expect(response).toContain('✓');
      expect(response).toContain('Проект');
      expect(response).toContain('Website');
    });

    /* Preconditions: Command parsed successfully with create task action
       Action: Generate response for create task without project
       Assertions: Returns success message with task name
       Requirements: clerkly.1 */
    it('should generate response for create task command without project', () => {
      const command = {
        action: 'create' as const,
        entity: 'task' as const,
        params: { name: 'Fix bug' },
      };
      const response = generateResponse(command);

      expect(response).toContain('✓');
      expect(response).toContain('Задача');
      expect(response).toContain('Fix bug');
    });

    /* Preconditions: Command parsed successfully with create task action and project
       Action: Generate response for create task with project
       Assertions: Returns success message with task and project names
       Requirements: clerkly.1 */
    it('should generate response for create task command with project', () => {
      const command = {
        action: 'create' as const,
        entity: 'task' as const,
        params: { name: 'Fix bug', projectName: 'Backend' },
      };
      const response = generateResponse(command);

      expect(response).toContain('✓');
      expect(response).toContain('Задача');
      expect(response).toContain('Fix bug');
      expect(response).toContain('Backend');
    });

    /* Preconditions: Command parsed successfully with create contact action
       Action: Generate response for create contact
       Assertions: Returns success message with contact name
       Requirements: clerkly.1 */
    it('should generate response for create contact command', () => {
      const command = {
        action: 'create' as const,
        entity: 'contact' as const,
        params: { name: 'John Doe' },
      };
      const response = generateResponse(command);

      expect(response).toContain('✓');
      expect(response).toContain('Контакт');
      expect(response).toContain('John Doe');
    });

    /* Preconditions: Command parsed successfully with show action
       Action: Generate response for show tasks
       Assertions: Returns success message about showing tasks
       Requirements: clerkly.1 */
    it('should generate response for show command', () => {
      const command = { action: 'show' as const, entity: 'task' as const, params: {} };
      const response = generateResponse(command);

      expect(response).toContain('✓');
      expect(response).toContain('задач');
    });

    /* Preconditions: Command not recognized
       Action: Generate response for unknown command
       Assertions: Returns help message with examples
       Requirements: clerkly.1 */
    it('should generate help message for unknown command', () => {
      const command = { action: 'unknown' as const, entity: 'unknown' as const, params: {} };
      const response = generateResponse(command);

      expect(response).toContain('не понял');
      expect(response).toContain('Создай проект');
      expect(response).toContain('Добавь задачу');
    });

    /* Preconditions: Command execution failed
       Action: Generate response with success: false
       Assertions: Returns error message
       Requirements: clerkly.1 */
    it('should generate error message when success is false', () => {
      const command = {
        action: 'create' as const,
        entity: 'project' as const,
        params: { name: 'Test' },
      };
      const response = generateResponse(command, false);

      expect(response).toContain('❌');
      expect(response).toContain('Не удалось');
    });
  });
});
