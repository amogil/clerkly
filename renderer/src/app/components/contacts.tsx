import { Plus, Mail, Phone, Building, Calendar, Edit2, Trash2, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  source: 'manual' | 'google-calendar';
  meetingsCount: number;
  lastMeeting?: string;
}

export function Contacts() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [contacts] = useState<Contact[]>([
    {
      id: '1',
      name: 'Sarah Chen',
      email: 'sarah.chen@company.com',
      phone: '+1 (555) 123-4567',
      company: 'TechCorp',
      role: 'Product Manager',
      source: 'google-calendar',
      meetingsCount: 24,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      id: '2',
      name: 'Mike Johnson',
      email: 'mike.johnson@company.com',
      phone: '+1 (555) 234-5678',
      company: 'TechCorp',
      role: 'Engineering Manager',
      source: 'google-calendar',
      meetingsCount: 18,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      id: '3',
      name: 'Alex Rivera',
      email: 'alex.rivera@company.com',
      phone: '+1 (555) 345-6789',
      company: 'TechCorp',
      role: 'Senior Engineer',
      source: 'google-calendar',
      meetingsCount: 15,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      id: '4',
      name: 'Jessica Liu',
      email: 'jessica.liu@company.com',
      company: 'TechCorp',
      role: 'UX Designer',
      source: 'google-calendar',
      meetingsCount: 12,
      lastMeeting: 'Yesterday, 10:00 AM',
    },
    {
      id: '5',
      name: 'David Lee',
      email: 'david.lee@company.com',
      phone: '+1 (555) 456-7890',
      company: 'TechCorp',
      role: 'Product Designer',
      source: 'manual',
      meetingsCount: 10,
      lastMeeting: 'Yesterday, 9:00 AM',
    },
    {
      id: '6',
      name: 'Emma Wilson',
      email: 'emma.wilson@company.com',
      company: 'TechCorp',
      role: 'Frontend Developer',
      source: 'google-calendar',
      meetingsCount: 14,
      lastMeeting: 'Yesterday, 9:00 AM',
    },
    {
      id: '7',
      name: 'Jennifer Smith',
      email: 'jennifer.smith@clientco.com',
      phone: '+1 (555) 567-8901',
      company: 'ClientCo',
      role: 'CEO',
      source: 'manual',
      meetingsCount: 3,
      lastMeeting: 'Yesterday, 3:15 PM',
    },
    {
      id: '8',
      name: 'Tom Anderson',
      email: 'tom.anderson@clientco.com',
      company: 'ClientCo',
      role: 'CTO',
      source: 'google-calendar',
      meetingsCount: 3,
      lastMeeting: 'Yesterday, 3:15 PM',
    },
  ]);

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: contacts.length,
    fromCalendar: contacts.filter(c => c.source === 'google-calendar').length,
    manual: contacts.filter(c => c.source === 'manual').length,
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">Contacts</h1>
            <p className="text-muted-foreground">
              Manage your contacts and meeting participants
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <p className="text-sm text-muted-foreground mb-1">Total Contacts</p>
            <p className="text-3xl font-semibold text-foreground">{stats.total}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <p className="text-sm text-muted-foreground mb-1">From Google Calendar</p>
            <p className="text-3xl font-semibold text-blue-600">{stats.fromCalendar}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <p className="text-sm text-muted-foreground mb-1">Added Manually</p>
            <p className="text-3xl font-semibold text-green-600">{stats.manual}</p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm mb-6 p-4">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search contacts by name, email, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="divide-y divide-border">
            {filteredContacts.map((contact) => (
              <div
                key={contact.id}
                className="p-6 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-lg font-semibold text-primary">
                        {contact.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground">
                          {contact.name}
                        </h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            contact.source === 'google-calendar'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-green-50 text-green-700 border border-green-200'
                          }`}
                        >
                          {contact.source === 'google-calendar' ? 'Google Calendar' : 'Manual'}
                        </span>
                      </div>
                      
                      {contact.role && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {contact.role} {contact.company && `at ${contact.company}`}
                        </p>
                      )}
                      
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-primary hover:underline"
                          >
                            {contact.email}
                          </a>
                        </div>
                        
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            <span className="text-foreground">{contact.phone}</span>
                          </div>
                        )}
                        
                        {contact.company && (
                          <div className="flex items-center gap-2 text-sm">
                            <Building className="w-4 h-4 text-muted-foreground" />
                            <span className="text-foreground">{contact.company}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {contact.meetingsCount} meetings
                            {contact.lastMeeting && ` · Last: ${contact.lastMeeting}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="p-2 hover:bg-secondary rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => {
                        // Delete contact logic
                      }}
                      className="p-2 hover:bg-secondary rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredContacts.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">No contacts found</p>
            </div>
          )}
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <UserPlus className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">
                Auto-sync from Google Calendar
              </h3>
              <p className="text-sm text-blue-700">
                Contacts are automatically added when they appear in your meeting participants. 
                You can also add contacts manually for better organization.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
