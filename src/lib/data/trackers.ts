import { orgDomain } from "../net/domain.ts";

/**
 * Open- and click-tracking hosts of mailing services and analytics. A pixel
 * from one of these is ordinary marketing; one from anywhere else deserves
 * a look.
 */
const TRACKERS = new Set([
  "list-manage.com", "mailchimp.com", "mcsv.net", "sendgrid.net", "mailgun.org", "mailgun.net",
  "mandrillapp.com", "exacttarget.com", "exct.net", "hubspotemail.net", "hs-analytics.net",
  "sparkpostmail.com", "awstrack.me", "mjt.lu", "mailjet.com", "sendinblue.com", "brevo.com",
  "sendibt3.com", "sibautomation.com", "klaviyomail.com", "klclick.com", "klclick1.com",
  "createsend.com", "cmail19.com", "cmail20.com", "rs6.net", "constantcontact.com", "mktoresp.com",
  "pardot.com", "en25.com", "eloqua.com", "google-analytics.com", "doubleclick.net", "mailerlite.com",
  "mlsend.com", "getresponse.com", "acems1.com", "activehosted.com", "convertkit-mail.com",
  "emltrk.com", "sailthru.com", "pstmrk.it", "msgfocus.com", "emsecure.net", "neolane.net", "bnc.lt",
]);

export function isKnownTracker(host: string): boolean {
  return TRACKERS.has(orgDomain(host));
}
