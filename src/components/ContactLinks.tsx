import { mapsHref, telHref, websiteLabel, type Contact } from "@/lib/contact";
import type { Dict } from "@/lib/i18n/en";

/** A member's public contact details as tap-to-call, email, maps, website and Instagram links. */
export function ContactLinks({ contact, t }: { contact: Contact; t: Dict["contact"] }) {
  const { phone, email, address, website, instagram } = contact;
  if (!phone && !email && !address && !website && !instagram) return null;
  return (
    <ul className="contact-links" aria-label={t.title}>
      {phone && (
        <li>
          <a href={telHref(phone)}>
            <span aria-hidden="true">☎</span> {phone}
          </a>
        </li>
      )}
      {email && (
        <li>
          <a href={`mailto:${email}`}>
            <span aria-hidden="true">✉</span> {email}
          </a>
        </li>
      )}
      {website && (
        <li>
          <a href={website} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">↗</span> {websiteLabel(website)}
          </a>
        </li>
      )}
      {instagram && (
        <li>
          <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">◎</span> @{instagram}
          </a>
        </li>
      )}
      {address && (
        <li>
          <a href={mapsHref(address)} target="_blank" rel="noopener noreferrer" title={t.directions}>
            <span aria-hidden="true">⌖</span> {address}
          </a>
        </li>
      )}
    </ul>
  );
}
