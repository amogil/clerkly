import React from 'react';
// Requirements: llm-integration.2, llm-integration.7.2
import { ChevronDownIcon } from 'lucide-react';
import { Logo } from '../logo';
import { ReasoningTrigger, useReasoning } from '../ai-elements/reasoning';

function renderThinkingMessage(isStreaming: boolean, duration: number | undefined) {
  if (isStreaming || duration === 0) {
    return <span>Thinking...</span>;
  }
  if (duration === undefined) {
    return <p>Thought for a few seconds</p>;
  }
  return <p>Thought for {duration} seconds</p>;
}

// Requirements: llm-integration.2, llm-integration.7.2, agents.4.11, agents.4.11.2
export function AgentReasoningTrigger() {
  const { isStreaming, isOpen, duration } = useReasoning();
  const isReasoningActive = isStreaming && isOpen;

  return (
    <ReasoningTrigger data-testid="message-llm-reasoning-trigger">
      <span className="inline-flex items-center justify-center [&_svg]:size-4">
        <Logo animated={isReasoningActive} showText={false} size="sm" />
      </span>
      {renderThinkingMessage(isStreaming, duration)}
      <ChevronDownIcon
        className={
          isOpen ? 'size-4 transition-transform rotate-180' : 'size-4 transition-transform rotate-0'
        }
      />
    </ReasoningTrigger>
  );
}
