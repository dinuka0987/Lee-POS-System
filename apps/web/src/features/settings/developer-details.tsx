import { useQuery } from '@tanstack/react-query';
import { CodeXml, Mail, Phone, Facebook, Globe, Clock } from 'lucide-react';
import { DEFAULT_DEVELOPER_CONTACT, type DeveloperContact } from '@lee/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export function DeveloperDetails() {
  const contact = useQuery({
    queryKey: ['developer-contact'],
    queryFn: () => api<DeveloperContact>('/settings/developer'),
  });
  const details = contact.data ?? DEFAULT_DEVELOPER_CONTACT;
  return (
    <section className="detail-panel developer-card" aria-labelledby="developer-heading">
      <div className="developer-heading">
        <span className="developer-icon">
          <CodeXml size={24} />
        </span>
        <div>
          <p className="eyebrow">HERE TO HELP</p>
          <h2 id="developer-heading">Developer & support</h2>
        </div>
      </div>
      {contact.isPending ? (
        <p className="muted-note">Loading developer details…</p>
      ) : contact.isError ? (
        <div className="error-banner" role="alert">
          {contact.error.message}
          <Button variant="outline" onClick={() => void contact.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <p className="developer-name">{details.name || 'Developer details'}</p>
          <p className="muted-note">Contact the developer</p>
          <dl className="developer-contacts">
            <div>
              <dt>
                <Mail size={20} />
                Email address
              </dt>
              <dd>
                {details.email ? (
                  <a href={`mailto:${details.email}`}>{details.email}</a>
                ) : (
                  'Not added'
                )}
              </dd>
            </div>
            <div>
              <dt>
                <Phone size={20} />
                Mobile number
              </dt>
              <dd>
                {details.mobile ? (
                  <a href={`tel:${details.mobile.replace(/[^\d+]/g, '')}`}>{details.mobile}</a>
                ) : (
                  'Not added'
                )}
              </dd>
            </div>
            <div>
              <dt>
                <Facebook size={20} />
                Facebook
              </dt>
              <dd>
                {details.facebookUrl ? (
                  <a href={details.facebookUrl} target="_blank" rel="noopener noreferrer">
                    View Facebook profile / page
                  </a>
                ) : (
                  'Not added'
                )}
              </dd>
            </div>
            {details.websiteUrl && (
              <div>
                <dt>
                  <Globe size={20} />
                  Website
                </dt>
                <dd>
                  <a href={details.websiteUrl} target="_blank" rel="noopener noreferrer">
                    {details.websiteUrl}
                  </a>
                </dd>
              </div>
            )}
            {details.supportHours && (
              <div>
                <dt>
                  <Clock size={20} />
                  Support hours
                </dt>
                <dd>{details.supportHours}</dd>
              </div>
            )}
          </dl>
        </>
      )}
    </section>
  );
}
