import { Plus, Mail, Phone, Building, Calendar, Edit2, Trash2, Search, UserPlus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useContacts } from '@/app/contexts/contacts-context';
import { getDisplayName, getPrimaryEmail, getPrimaryPhone, getCompanyName, getJobTitle, getInitials, isGoogleContact } from '@/app/types/contact';

interface ContactsProps {
  triggerAction?: { action: string; params: any } | null;
}

export function Contacts({ triggerAction }: ContactsProps) {
  const { contacts, addContact, deleteContact } = useContacts();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredContacts = contacts.filter(contact => {
    const displayName = getDisplayName(contact).toLowerCase();
    const email = getPrimaryEmail(contact)?.toLowerCase() || '';
    const company = getCompanyName(contact)?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    
    return displayName.includes(query) || email.includes(query) || company.includes(query);
  });

  const stats = {
    total: contacts.length,
    fromGoogle: contacts.filter(c => isGoogleContact(c)).length,
    manual: contacts.filter(c => !isGoogleContact(c)).length,
  };

  // Handle AI agent commands
  useEffect(() => {
    if (!triggerAction) return;
    
    if (triggerAction.action === 'create' && triggerAction.params.entity === 'contact') {
      const newContact = {
        resourceName: `people/c${Date.now()}`,
        names: [{ displayName: triggerAction.params.name || 'Unnamed Contact' }],
        emailAddresses: [],
        metadata: { sources: [{ type: 'PROFILE' }] },
        meetingsCount: 0,
      };
      addContact(newContact);
    }
  }, [triggerAction, addContact]);

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
                        <span className="text-lg font-semibold text-primary">
                          {initials}
                        </span>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-foreground">
                            {displayName}
                          </h3>
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
                              <a
                                href={`mailto:${email}`}
                                className="text-primary hover:underline"
                              >
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
                        onClick={() => deleteContact(contact.resourceName)}
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
              <p className="text-muted-foreground">No contacts found</p>
            </div>
          )}
        </div>

        {/* Info Box */}
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