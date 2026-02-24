// Requirements: agents.4

import React from 'react';
import { Video, CheckSquare, FileText, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { Logo } from '../logo';

interface AgentWelcomeProps {
  onPromptClick?: (prompt: string) => void;
}

export function AgentWelcome({ onPromptClick }: AgentWelcomeProps) {
  const prompts = [
    {
      icon: <Video className="w-4 h-4" />,
      prompt: 'Transcribe my latest meeting',
    },
    {
      icon: <CheckSquare className="w-4 h-4" />,
      prompt: "Extract action items from today's standup",
    },
    {
      icon: <FileText className="w-4 h-4" />,
      prompt: 'Create Jira tickets from meeting notes',
    },
    {
      icon: <Calendar className="w-4 h-4" />,
      prompt: 'Send summary to the team',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col items-center justify-center space-y-8 py-12"
    >
      {/* Logo and title */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <Logo size="lg" animated={true} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-1">Assign a task to the agent</h2>
          <p className="text-sm text-muted-foreground">
            Transcribes meetings, extracts tasks, creates Jira tickets
          </p>
        </div>
      </div>

      {/* Prompt suggestions grid */}
      <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-3">
        {prompts.map((item, index) => (
          <motion.button
            key={index}
            onClick={() => onPromptClick?.(item.prompt)}
            className="group flex items-center gap-3 p-4 bg-secondary/50 hover:bg-secondary border border-border hover:border-primary/50 rounded-xl transition-all text-left"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              {item.icon}
            </div>
            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
              {item.prompt}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
