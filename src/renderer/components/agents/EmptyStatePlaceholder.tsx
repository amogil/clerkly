// Requirements: agents.4

import React from 'react';
import { MessageSquare } from 'lucide-react';

export function EmptyStatePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <MessageSquare className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">Start a conversation</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Ask a question, give a command, or describe what you&apos;d like help with. Your AI agent is
        ready to assist.
      </p>
    </div>
  );
}
