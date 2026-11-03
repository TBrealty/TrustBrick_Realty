import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { LEGAL } from "@/lib/legal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — Trustbrick",
  description: "What personal data Trustbrick collects, why, who it's shared with, how long it's kept, and your rights over it.",
};

const mail = (address: string) => (address.startsWith("[") ? address : <a href={`mailto:${address}`}>{address}</a>);

/**
 * The Privacy Policy. It describes what the product actually does today; when a feature changes
 * what is collected or who sees it, update this page (and LEGAL.updated) in the same change.
 */
export default function PrivacyPage() {
  const g = LEGAL.grievanceOfficer;
  return (
    <LegalDocument
      title="Privacy Policy"
      intro={
        <>
          <p>
            This policy explains how {LEGAL.company} (&ldquo;Trustbrick&rdquo;, &ldquo;we&rdquo;) collects and uses personal data when you use the
            Trustbrick website and the Trustbrick app (together, &ldquo;Trustbrick&rdquo;). We wrote it to be read: it says plainly what we
            collect, why, who sees it, and what you can do about it.
          </p>
          <p>
            For the purposes of India&rsquo;s Digital Personal Data Protection Act, 2023, Trustbrick is the &ldquo;Data Fiduciary&rdquo; for the
            personal data described here. We do not sell your personal data.
          </p>
        </>
      }
      sections={[
        {
          id: "collect",
          title: "What we collect",
          body: (
            <>
              <h3>When you create an account</h3>
              <ul>
                <li>Your name, email address and, if you give it, your phone number.</li>
                <li>Your password, which we store only in a scrambled (hashed) form that can&rsquo;t be read back.</li>
              </ul>
              <h3>When you use Trustbrick to find a home</h3>
              <ul>
                <li>The homes you save.</li>
                <li>Enquiries and visit requests you send: your name, phone number, email address, your message, and the date you&rsquo;d like to visit.</li>
                <li>Homestay bookings: your dates, the number of guests, your name and phone number, and any message to the host.</li>
                <li>Messages you exchange with agents and hosts on Trustbrick.</li>
                <li>Reports you make about a listing, and messages you send us through Contact us.</li>
                <li>If you ask for Legal Verification: the property&rsquo;s details and the documents you choose to share.</li>
              </ul>
              <h3>If you are an agent, broker, developer or host</h3>
              <ul>
                <li>Your application: your professional details (for agents, your RERA registration and experience, if you give them) and, for an organization, its name, GSTIN, address, website and contact details.</li>
                <li>The properties you list: their details, address, map location, photos, videos, floor plans, virtual tours, and documents you upload (documents are private: only your team and Trustbrick&rsquo;s reviewers see them).</li>
                <li>The leads, visits, bookings and messages in your workspace, your plan, and the commission records between your business and Trustbrick.</li>
              </ul>
              <h3>Collected automatically</h3>
              <ul>
                <li>Technical details of each visit: your IP address, browser and device type, and the times you sign in. We use them to keep your account secure, to limit abuse (such as repeated failed sign-ins) and to investigate problems.</li>
                <li>A record of important actions (for example a listing approved, a booking confirmed, a password changed), with when and from where they happened, so that what happened to an account or a listing can be traced.</li>
                <li>How often listings are viewed. We count viewers using a one-way code, not your identity, so the counts can&rsquo;t be traced back to you.</li>
              </ul>
              <h3>In the Trustbrick app, only if you allow it</h3>
              <ul>
                <li><strong>Notifications:</strong> a token that lets us send notifications to your phone.</li>
                <li><strong>Location:</strong> when an agent or host taps &ldquo;Use my current location&rdquo; to place a property on the map. We store the property&rsquo;s map pin, not your movements.</li>
                <li><strong>Camera and motion sensors:</strong> to take photos and guided 360° photos of a property. Only the photos you choose to send are uploaded.</li>
              </ul>
            </>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <>
              <p>We use personal data to:</p>
              <ul>
                <li>run your account and the features you use: search, saved homes, enquiries, visits, bookings, messages, plans and Legal Verification;</li>
                <li>put you in touch with the agent, organization or host you contact, and them with you;</li>
                <li>review agents, hosts and listings before they go live, and handle reports, so the information on Trustbrick can be trusted;</li>
                <li>send you emails and notifications about your account and activity (sign-up confirmation, password resets, new enquiries, booking updates, review decisions). In the Trustbrick app and in a partner workspace you can turn most notifications off; security messages always come;</li>
                <li>keep Trustbrick secure, prevent fraud and abuse, and fix problems;</li>
                <li>keep the business, commission and billing records the law requires;</li>
                <li>improve Trustbrick, using counts and trends rather than individual profiles.</li>
              </ul>
              <p>
                We process your data because you&rsquo;ve given your consent by using Trustbrick for these purposes, or where the law
                otherwise allows it (for example to meet a legal obligation). We do not use your data for advertising, and we do not
                show you third-party ads.
              </p>
            </>
          ),
        },
        {
          id: "share",
          title: "Who can see it",
          body: (
            <>
              <ul>
                <li><strong>Everyone visiting Trustbrick</strong> sees published listings: their details, photos and approximate location, and the name of the agent, organization or host. A homestay&rsquo;s exact address is shown only to a guest whose booking is confirmed.</li>
                <li><strong>The agent, organization or host you contact</strong> receives your enquiry or booking, including your name, phone number, email and message. A host sees a guest&rsquo;s phone number once the booking is confirmed.</li>
                <li><strong>Within an organization,</strong> its managers can see the listings, leads and visits of the agents they are responsible for.</li>
                <li><strong>Independent advocates</strong> receive the documents and details of a Legal Verification request you make, and use them only for that request.</li>
                <li><strong>Trustbrick&rsquo;s team</strong> sees what it needs to review applications and listings, handle reports, and support you.</li>
                <li>
                  <strong>Service providers</strong> who run parts of Trustbrick for us, under contract and only on our instructions:
                  Amazon Web Services (hosting, our database, file storage and email, in Mumbai, India) and Expo (delivering notifications
                  to the Trustbrick app). Some pages show maps from OpenStreetMap, whose servers receive your IP address when the map loads.
                </li>
                <li><strong>Authorities,</strong> when the law requires it, or to protect the rights and safety of our users or of Trustbrick.</li>
              </ul>
              <p>If Trustbrick is ever merged or sold, your data may pass to the new owner, who must keep to this policy.</p>
            </>
          ),
        },
        {
          id: "where",
          title: "Where it's stored",
          body: (
            <p>
              Your data is stored in India, on Amazon Web Services in Mumbai. Notification delivery for the Trustbrick app passes through
              Expo, whose servers may be outside India; it receives the notification and your device&rsquo;s token, not your account data.
            </p>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <ul>
              <li>Your account and what&rsquo;s in it are kept while your account is open.</li>
              <li>When you ask us to delete your account, we delete or anonymise your personal data within 30 days, except what the law requires us to keep (for example tax, billing and commission records) or what we need to resolve a dispute, which we keep only as long as needed.</li>
              <li>Sign-in sessions expire on their own; records used to stop abuse (such as failed sign-ins) are kept for a short time.</li>
              <li>Listings that are closed or archived stay in the owning agent&rsquo;s records so the history of a property can be traced.</li>
            </ul>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <>
              <p>Under the Digital Personal Data Protection Act, 2023 you can:</p>
              <ul>
                <li>ask for a summary of the personal data we hold about you and how we use it;</li>
                <li>correct or update it (most of it you can change yourself in your account);</li>
                <li>ask us to delete it, and withdraw your consent (this may mean closing your account);</li>
                <li>nominate someone to exercise these rights for you if you are unable to;</li>
                <li>raise a complaint with our Grievance Officer, and if you are not satisfied, with the Data Protection Board of India.</li>
              </ul>
              <p>
                To use any of these rights, write to {mail(LEGAL.contactEmail)} from the email address on your account. We may need to
                confirm it&rsquo;s you before acting.
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies and similar storage",
          body: (
            <>
              <p>
                We use only the cookies Trustbrick needs to work: to keep you signed in, remember which workspace you&rsquo;re using, and
                carry you through sign-up. Your browser also remembers a few preferences on your device, such as light or dark mode and
                the ticks on the PG checklist; these never leave your device.
              </p>
              <p>We do not use advertising or tracking cookies, and we do not use third-party analytics.</p>
            </>
          ),
        },
        {
          id: "security",
          title: "How we protect it",
          body: (
            <p>
              Connections to Trustbrick are encrypted (HTTPS), passwords are stored hashed, private documents and virtual tours are served
              only to the people allowed to see them, our database is reachable only from our own servers, and access within Trustbrick is
              limited to the people who need it. No system is perfectly secure; if a breach affects your data, we will tell you and the
              authorities as the law requires.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>Trustbrick is for adults. You must be 18 or older to create an account. We do not knowingly collect data from children.</p>,
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: (
            <p>
              When we change this policy, we update the date at the top. If a change is significant, we will tell you by email or on
              Trustbrick before it takes effect.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Grievance Officer and contact",
          body: (
            <>
              <p>
                For questions, requests or complaints about your personal data, contact our Grievance Officer. We acknowledge complaints
                within 24 hours and aim to resolve them within 15 days.
              </p>
              <p>
                <strong>{g.name}</strong>, Grievance Officer
                <br />
                {LEGAL.company}
                <br />
                {LEGAL.registeredOffice}
                <br />
                Email: {mail(g.email)}
              </p>
              <p>
                You can also reach us through <a href="/contact">Contact us</a> on {site.name}.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
