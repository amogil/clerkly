import { useState, useRef, useEffect } from 'react';
import { Send, FileText, CheckSquare, Calendar, Video, Clock, User } from 'lucide-react';
import { Logo } from './logo';

interface AIAgentPanelProps {
  onCommand: (command: string) => void;
}

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string | React.ReactNode;
  timestamp: Date;
}

export function AIAgentPanel({ onCommand }: AIAgentPanelProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'agent',
      content: (
        <div>
          <p>Good morning! Here's a quick overview of today:</p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg">
              <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Product Roadmap Review</p>
                <p className="text-xs text-muted-foreground">Today at 2:30 PM · 45 min</p>
              </div>
            </div>
          </div>
        </div>
      ),
      timestamp: new Date('2026-02-01T09:00:00'),
    },
    {
      id: '2',
      type: 'user',
      content: 'Show me tasks from yesterday\'s design sync meeting',
      timestamp: new Date('2026-02-01T09:05:00'),
    },
    {
      id: '3',
      type: 'agent',
      content: (
        <div>
          <p>I found 3 tasks from the Design Sync meeting on Jan 31:</p>
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2 p-2 bg-secondary/30 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
              <CheckSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Update color palette in design system</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span>Alex Rivera</span>
                  <span>·</span>
                  <Clock className="w-3 h-3" />
                  <span>Due Feb 5</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-2 bg-secondary/30 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
              <CheckSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Create mockups for mobile onboarding</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span>Sarah Chen</span>
                  <span>·</span>
                  <Clock className="w-3 h-3" />
                  <span>Due Feb 3</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-2 bg-secondary/30 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
              <CheckSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Review accessibility standards</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span>Mike Johnson</span>
                  <span>·</span>
                  <Clock className="w-3 h-3" />
                  <span>Due Feb 2</span>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Click any task to view details</p>
        </div>
      ),
      timestamp: new Date('2026-02-01T09:05:15'),
    },
    {
      id: '4',
      type: 'user',
      content: 'Find the recording from that meeting',
      timestamp: new Date('2026-02-01T09:07:00'),
    },
    {
      id: '5',
      type: 'agent',
      content: (
        <div>
          <p>Here's the recording from Design Sync on Jan 31:</p>
          <div className="mt-3">
            <div className="flex items-start gap-3 p-3 bg-secondary/30 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
              <Video className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Design Sync - Jan 31, 2026</p>
                <p className="text-xs text-muted-foreground mt-1">42:18 · 5 participants · Transcribed</p>
                <div className="mt-2 flex gap-2 text-xs">
                  <button className="px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors">
                    View transcript
                  </button>
                  <button className="px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors">
                    Play recording
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      timestamp: new Date('2026-02-01T09:07:08'),
    },
    {
      id: '6',
      type: 'user',
      content: 'Any important documents from that meeting?',
      timestamp: new Date('2026-02-01T09:08:00'),
    },
    {
      id: '7',
      type: 'agent',
      content: (
        <div>
          <p>Yes, 2 documents were referenced during the meeting:</p>
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2 p-2 bg-secondary/30 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
              <FileText className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Q1 Design System Guidelines</p>
                <p className="text-xs text-muted-foreground mt-0.5">Updated Jan 30 · Shared by Alex Rivera</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-2 bg-secondary/30 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
              <FileText className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Mobile App Wireframes v2</p>
                <p className="text-xs text-muted-foreground mt-0.5">Updated Jan 28 · Shared by Sarah Chen</p>
              </div>
            </div>
          </div>
        </div>
      ),
      timestamp: new Date('2026-02-01T09:08:12'),
    },
    {
      id: '8',
      type: 'user',
      content: 'Create a task to review these documents before the roadmap meeting',
      timestamp: new Date('2026-02-01T09:10:00'),
    },
    {
      id: '9',
      type: 'agent',
      content: (
        <div>
          <p>Done! I've created a new task and linked the documents:</p>
          <div className="mt-3">
            <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border-2 border-primary">
              <CheckSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Review design documents for roadmap meeting</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span>You</span>
                  <span>·</span>
                  <Clock className="w-3 h-3" />
                  <span>Due Today at 2:00 PM</span>
                </div>
                <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Linked documents:</p>
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <FileText className="w-3 h-3" />
                    <span>Q1 Design System Guidelines</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <FileText className="w-3 h-3" />
                    <span>Mobile App Wireframes v2</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      timestamp: new Date('2026-02-01T09:10:15'),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const newMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };
    
    setMessages([...messages, newMessage]);
    onCommand(input);
    setInput('');

    // Simulate agent response
    setTimeout(() => {
      const agentResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: 'I\'m processing your request...',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, agentResponse]);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-1/3 bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="h-16 px-6 border-b border-border flex items-center">
        <div className="flex items-center gap-3">
          <Logo size="sm" showText={false} />
          <h3 className="text-lg font-semibold text-foreground">Clerkly</h3>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="space-y-1">
            {message.type === 'user' ? (
              // User messages with border and background
              <div className="ml-auto max-w-[80%] rounded-lg border-2 border-primary bg-primary/5 px-4 py-3">
                <p className="text-sm leading-relaxed text-foreground">{message.content}</p>
              </div>
            ) : (
              // Agent messages - plain text on white background
              <div className="max-w-[90%] text-sm leading-relaxed text-foreground">
                {message.content}
              </div>
            )}
            <div className={`text-xs text-muted-foreground ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
              {formatTime(message.timestamp)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a command..."
            className="flex-1 px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 px-0.5">
          Press Enter to send
        </p>
      </div>
    </div>
  );
}