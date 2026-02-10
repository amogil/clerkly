import React, { useState, useEffect } from 'react';
import { Mail, Phone, Building, Calendar, Edit2, Trash2, Search } from 'lucide-react';
import { Logger } from '../Logger';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('Contacts');

// Google Contacts API structure
interface Contact {
  resourceName: string;
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
  emailAddresses?: Array<{ value: string; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  organizations?: Array<{ name?: string; title?: string }>;
  metadata: { sources: Array<{ type: string }> };
  meetingsCount?: number;
  lastMeeting?: string;
}

interface ContactsProps {
  triggerAction?: { action: string; params: Record<string, unknown> } | null;
}

// Helper functions for Google Contacts structure
const getDisplayName = (contact: Contact): string => {
  return contact.names?.[0]?.displayName || 'Unknown';
};

const getPrimaryEmail = (contact: Contact): string | undefined => {
  return contact.emailAddresses?.[0]?.value;
};

const getPrimaryPhone = (contact: Contact): string | undefined => {
  return contact.phoneNumbers?.[0]?.value;
};

const getCompanyName = (contact: Contact): string | undefined => {
  return contact.organizations?.[0]?.name;
};

const getJobTitle = (contact: Contact): string | undefined => {
  return contact.organizations?.[0]?.title;
};

const getInitials = (contact: Contact): string => {
  const name = getDisplayName(contact);
  return name
    .split(' ')
    .map((n) => n[0])
    .join('');
};

const isGoogleContact = (contact: Contact): boolean => {
  return contact.metadata.sources.some((s) => s.type === 'CONTACT');
};

export function Contacts({ triggerAction }: ContactsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showAddModal, setShowAddModal] = useState(false);

  // Mock contacts with Google Contacts structure
  const [contacts] = useState<Contact[]>([
    {
      resourceName: 'people/c1',
      names: [{ displayName: 'Sarah Chen', givenName: 'Sarah', familyName: 'Chen' }],
      emailAddresses: [{ value: 'sarah.chen@company.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 123-4567', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Product Manager' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 24,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      resourceName: 'people/c2',
      names: [{ displayName: 'Mike Johnson', givenName: 'Mike', familyName: 'Johnson' }],
      emailAddresses: [{ value: 'mike.johnson@company.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 234-5678', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Engineering Manager' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 18,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      resourceName: 'people/c3',
      names: [{ displayName: 'Alex Rivera', givenName: 'Alex', familyName: 'Rivera' }],
      emailAddresses: [{ value: 'alex.rivera@company.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 345-6789', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Senior Engineer' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 15,
      lastMeeting: 'Today, 2:30 PM',
    },
    {
      resourceName: 'people/c4',
      names: [{ displayName: 'Jessica Liu', givenName: 'Jessica', familyName: 'Liu' }],
      emailAddresses: [{ value: 'jessica.liu@company.com', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'UX Designer' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 12,
      lastMeeting: 'Yesterday, 10:00 AM',
    },
    {
      resourceName: 'people/c5',
      names: [{ displayName: 'David Lee', givenName: 'David', familyName: 'Lee' }],
      emailAddresses: [{ value: 'david.lee@company.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 456-7890', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Product Designer' }],
      metadata: { sources: [{ type: 'PROFILE' }] },
      meetingsCount: 10,
      lastMeeting: 'Yesterday, 9:00 AM',
    },
    {
      resourceName: 'people/c6',
      names: [{ displayName: 'Emma Wilson', givenName: 'Emma', familyName: 'Wilson' }],
      emailAddresses: [{ value: 'emma.wilson@company.com', type: 'work' }],
      organizations: [{ name: 'TechCorp', title: 'Frontend Developer' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 14,
      lastMeeting: 'Yesterday, 9:00 AM',
    },
    {
      resourceName: 'people/c7',
      names: [{ displayName: 'Jennifer Smith', givenName: 'Jennifer', familyName: 'Smith' }],
      emailAddresses: [{ value: 'jennifer.smith@clientco.com', type: 'work' }],
      phoneNumbers: [{ value: '+1 (555) 567-8901', type: 'work' }],
      organizations: [{ name: 'ClientCo', title: 'CEO' }],
      metadata: { sources: [{ type: 'PROFILE' }] },
      meetingsCount: 3,
      lastMeeting: 'Yesterday, 3:15 PM',
    },
    {
      resourceName: 'people/c8',
      names: [{ displayName: 'Tom Anderson', givenName: 'Tom', familyName: 'Anderson' }],
      emailAddresses: [{ value: 'tom.anderson@clientco.com', type: 'work' }],
      organizations: [{ name: 'ClientCo', title: 'CTO' }],
      metadata: { sources: [{ type: 'CONTACT' }] },
      meetingsCount: 3,
      lastMeeting: 'Yesterday, 3:15 PM',
    },
  ]);

  const filteredContacts = contacts.filter((contact) => {
    const displayName = getDisplayName(contact).toLowerCase();
    const email = getPrimaryEmail(contact)?.toLowerCase() || '';
    const company = getCompanyName(contact)?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();

    return displayName.includes(query) || email.includes(query) || company.includes(query);
  });

  // Handle AI agent commands
  useEffect(() => {
    if (!triggerAction) return;

    if (triggerAction.action === 'create' && triggerAction.params.entity === 'contact') {
      logger.info('Create contact:', triggerAction.params);
    }
  }, [triggerAction]);

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">Contacts</h1>
          </div>
        </div>

        {/* Search */}
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

        {/* Contacts List */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="divide-y divide-border">
            {filteredContacts.map((contact) => {
              const displayName = getDisplayName(contact);
              const email = getPrimaryEmail(contact);
              const phone = getPrimaryPhone(contact);
              const company = getCompanyName(contact);
              const jobTitle = getJobTitle(contact);
              const initials = getInitials(contact);
              const isFromGoogle = isGoogleContact(contact);

              return (
                <div
                  key={contact.resourceName}
                  className="p-6 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-lg font-semibold text-primary">{initials}</span>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-foreground">{displayName}</h3>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              isFromGoogle
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-green-50 text-green-700 border border-green-200'
                            }`}
                          >
                            {isFromGoogle ? 'Google Contacts' : 'Manual'}
                          </span>
                        </div>

                        {jobTitle && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {jobTitle} {company && `at ${company}`}
                          </p>
                        )}

                        <div className="space-y-2">
                          {email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="w-4 h-4 text-muted-foreground" />
                              <a href={`mailto:${email}`} className="text-primary hover:underline">
                                {email}
                              </a>
                            </div>
                          )}

                          {phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-4 h-4 text-muted-foreground" />
                              <span className="text-foreground">{phone}</span>
                            </div>
                          )}

                          {company && !jobTitle && (
                            <div className="flex items-center gap-2 text-sm">
                              <Building className="w-4 h-4 text-muted-foreground" />
                              <span className="text-foreground">{company}</span>
                            </div>
                          )}

                          {contact.meetingsCount !== undefined && (
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {contact.meetingsCount} meetings
                                {contact.lastMeeting && ` · Last: ${contact.lastMeeting}`}
                              </span>
                            </div>
                          )}
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
                        onClick={() => logger.info('Delete contact:', contact.resourceName)}
                        className="p-2 hover:bg-secondary rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredContacts.length === 0 && (
            <div className="p-12 text-center">
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-2">No contacts found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
