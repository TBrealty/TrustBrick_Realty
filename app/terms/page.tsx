import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use — Trustbrick",
  description: "The terms for using Trustbrick: accounts, listings, enquiries and bookings, agents and hosts, plans, and our responsibilities and yours.",
};

const mail = (address: string) => (address.startsWith("[") ? address : <a href={`mailto:${address}`}>{address}</a>);

/**
 * The Terms of Use. Like the Privacy Policy, it describes how Trustbrick works today; update it
 * (and LEGAL.updated) when a feature changes what people agree to.
 */
export default function TermsPage() {
  const g = LEGAL.grievanceOfficer;
  return (
    <LegalDocument
      title="Terms of Use"
      intro={
        <>
          <p>
            These terms are an agreement between you and {LEGAL.company} (&ldquo;Trustbrick&rdquo;, &ldquo;we&rdquo;), registered at{" "}
            {LEGAL.registeredOffice} (CIN {LEGAL.cin}). They apply to the Trustbrick website and the Trustbrick app. By creating an account
            or using Trustbrick, you agree to them and to our <a href="/privacy">Privacy Policy</a>. If you don&rsquo;t agree, please don&rsquo;t
            use Trustbrick.
          </p>
        </>
      }
      sections={[
        {
          id: "what",
          title: "What Trustbrick is",
          body: (
            <>
              <p>
                Trustbrick is a platform where people find homes to buy or rent, PGs, homestays and investment properties, and where
                approved agents, brokerages, developers and hosts list them. Listings are created by those agents and hosts, not by
                Trustbrick.
              </p>
              <p>
                Agreements to buy, sell, rent, lease or stay are made directly between you and the other party. Trustbrick is not a party
                to them, does not own the properties listed, and does not guarantee that any transaction will happen or how it turns out.
              </p>
            </>
          ),
        },
        {
          id: "accounts",
          title: "Your account",
          body: (
            <ul>
              <li>You must be 18 or older, and able to enter into a binding contract under Indian law.</li>
              <li>Give accurate details, keep them up to date, and use your own account. One person, one account.</li>
              <li>Keep your password safe. You are responsible for what is done with your account; tell us at once if you think someone else has used it.</li>
              <li>We may suspend or close an account that breaks these terms, after telling you why where we can.</li>
            </ul>
          ),
        },
        {
          id: "listings",
          title: "Listings and the information on them",
          body: (
            <>
              <p>
                We approve agents and hosts before they can list, and review every listing before it is published (see{" "}
                <Link href="/#trust">how we check</Link>). That review reduces mistakes and misuse, but it can&rsquo;t catch everything: details,
                prices, availability and photos are provided by the lister, who is responsible for them.
              </p>
              <ul>
                <li>Before you pay anything or sign anything, visit the property and check the documents yourself, or with an adviser. Our <a href="/legal-verification">Legal Verification</a> service can help.</li>
                <li>A listing marked &ldquo;Sample&rdquo; is an example, not a real property.</li>
                <li>Concept features such as Trustbrick Score™ and Trustbrick Value™ are shown with sample data where marked, and are not valuations or advice.</li>
                <li>If a listing looks wrong, use &ldquo;Report&rdquo; on it. We review every report.</li>
              </ul>
            </>
          ),
        },
        {
          id: "customers",
          title: "Enquiries, visits and homestay bookings",
          body: (
            <>
              <ul>
                <li>When you send an enquiry or ask for a visit, your details go to the agent or organization behind the listing, so they can reply.</li>
                <li>
                  <strong>Homestays:</strong> you request to book (or book at once where a host offers instant booking). A host accepts or
                  declines a request; a request not answered in time expires. Unless the booking page says otherwise, you pay the host
                  directly at the property, and the host&rsquo;s house rules and the cancellation policy shown when you book apply.
                </li>
                <li>Be respectful in messages, turn up for visits you&rsquo;ve arranged, and cancel in good time if your plans change.</li>
              </ul>
            </>
          ),
        },
        {
          id: "partners",
          title: "Agents, brokers, developers and hosts",
          body: (
            <>
              <p>If you list on Trustbrick, you also agree that:</p>
              <ul>
                <li>you hold any registration the law requires for your work (for example under RERA), and you comply with the laws that apply to your listings and services;</li>
                <li>you are authorised by the owner to list each property, and what you publish is accurate, current and not misleading;</li>
                <li>you own, or have permission to use, the photos, videos, tours and documents you upload;</li>
                <li>you handle the personal data of people who contact you only to respond to them and to complete their transaction, and in line with the law;</li>
                <li>
                  <strong>Your organization&rsquo;s people:</strong> the people your organization adds to its workspace join without a separate
                  review by Trustbrick. Your organization vouches for them, gives them only the access their work needs, removes them when they
                  leave, and is responsible for what they do on Trustbrick in its name;
                </li>
                <li>
                  <strong>Commission:</strong> before your listings can be submitted, your organization accepts Trustbrick&rsquo;s commission
                  rates shown in your workspace. Commission, plus GST, is charged on deals you close through Trustbrick and on homestay
                  bookings when a guest checks in, as those rates set out. It is payable as Trustbrick asks, quoting each charge&rsquo;s
                  reference. Charges made at an earlier rate keep that rate.
                </li>
                <li>We may pause or remove a listing, or suspend an account, that breaks these terms, after telling you why where we can.</li>
              </ul>
            </>
          ),
        },
        {
          id: "plans",
          title: "Plans and payments",
          body: (
            <ul>
              <li>Trustbrick has a free plan, and paid plans for people (Plus) and for agents and hosts (Pro and Business). Each plan&rsquo;s features are listed on the <a href="/plans">plans page</a>; features marked &ldquo;coming soon&rdquo; are not yet included.</li>
              <li>Paid plans may start with a free trial. A trial ends on its own unless you choose a paid plan; one trial per person or organization.</li>
              <li>When you choose a paid plan, we contact you to arrange payment. Prices are shown before you choose, and GST is added where it applies.</li>
              <li>A plan renews at the end of each period unless you stop it. If you stop renewal, the plan keeps working until the end of the period you&rsquo;ve paid for. Payments already made are not refunded unless the law requires it or we agree otherwise.</li>
            </ul>
          ),
        },
        {
          id: "legal-verification",
          title: "Legal Verification",
          body: (
            <p>
              Legal Verification is carried out by independent advocates. Trustbrick arranges it and keeps you informed, but the opinion is
              the advocate&rsquo;s own, given to you, and signed by them. It covers the documents and records checked at the time; it is not
              a guarantee about the property.
            </p>
          ),
        },
        {
          id: "content",
          title: "What you post, and what's not allowed",
          body: (
            <>
              <p>
                You keep ownership of what you upload. You give Trustbrick permission to host, show, adapt (for example resize or crop) and
                distribute it on Trustbrick and in promoting your listings, for as long as it is on Trustbrick.
              </p>
              <p>You must not:</p>
              <ul>
                <li>post anything false, misleading, unlawful, discriminatory, abusive, or that infringes someone else&rsquo;s rights;</li>
                <li>list a property you aren&rsquo;t authorised to list, or one that is no longer available;</li>
                <li>use Trustbrick to send spam, or contact people for anything other than the listing they enquired about;</li>
                <li>copy listings or other users&rsquo; data in bulk (by scraping or otherwise), or use them outside Trustbrick;</li>
                <li>try to get around reviews, payments or security, interfere with how Trustbrick works, or access accounts or data that aren&rsquo;t yours.</li>
              </ul>
              <p>
                We may remove content that breaks these terms or the law, including when we are told about it by an affected person or an
                authority, as the Information Technology Act, 2000 and its rules require.
              </p>
            </>
          ),
        },
        {
          id: "ip",
          title: "Trustbrick's name and software",
          body: (
            <p>
              The Trustbrick name, logo, design, software and the content we create belong to Trustbrick or our licensors. You may use
              Trustbrick for its intended purpose; you may not copy, sell or build on it without our written permission.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Our responsibility",
          body: (
            <>
              <p>
                We work to keep Trustbrick available, accurate and secure, but we provide it &ldquo;as is&rdquo;, without promising it will
                always be available or free of errors.
              </p>
              <p>
                To the extent the law allows, Trustbrick is not liable for losses arising from listings or information provided by other
                users, from agreements or disputes between users, or for indirect or consequential losses. Where we are liable, our total
                liability to you is limited to the fees you paid Trustbrick in the 12 months before the claim. Nothing in these terms limits
                liability that the law does not allow us to limit.
              </p>
              <p>
                You agree to compensate Trustbrick for losses caused by your breach of these terms or the law, including claims by others
                about content you posted.
              </p>
            </>
          ),
        },
        {
          id: "law",
          title: "Disputes and the law that applies",
          body: (
            <p>
              These terms are governed by the laws of India. Please contact us first: most problems can be solved quickly. If a dispute can&rsquo;t
              be resolved, the courts at {LEGAL.courts} have jurisdiction.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes to these terms",
          body: (
            <p>
              We may update these terms as Trustbrick changes. We will update the date at the top, and tell you in advance of significant
              changes by email or on Trustbrick. If you keep using Trustbrick after a change takes effect, the new terms apply.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Grievance Officer and contact",
          body: (
            <>
              <p>
                For complaints about content on Trustbrick or about these terms, contact our Grievance Officer. We acknowledge complaints
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
                General questions: {mail(LEGAL.contactEmail)} or <a href="/contact">Contact us</a>.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
