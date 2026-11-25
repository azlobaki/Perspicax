import { isFreeMail } from "../data/freemail.ts";
import type { Finding } from "../finding.ts";
import { sameOrg } from "../net/domain.ts";
import { fold, quote } from "./bank.ts";

// Matched against a lowercased, accent-free copy of the text (see `fold`).
const UNUSUAL_PAYMENT =
  /\b(?:gift ?cards?|(?:apple|itunes|google play|steam|amazon|ebay|visa|vanilla|razer gold) (?:gift )?cards?|cartes? ?-?cadeaux?|cartes? (?:google play|apple|itunes|steam|amazon|pcs|neosurf|transcash|paysafecard)|paysafecards?|neosurf|transcash|bitcoins?|btc|usdt|tether|ethereum|crypto(?:currenc(?:y|ies)|-?monnaies?)|wallet address|adresse (?:de |du )?portefeuille)\b/g;
// Someone being asked to do it, not a shop selling it.
const ASKED =
  /\b(?:buy|purchase|get me|get some|pick up|send|grab|scratch|achet\w*|procur\w*|envoi\w*|envoy\w*|prendre|recuper\w*|transmet\w*|gratt\w*|regle\w*)\b/;
const SECRECY =
  /\b(?:keep (?:this|it) (?:between us|confidential|to yourself|quiet)|between (?:you and me|us)|don'?t tell|do not tell|(?:confidential|discreet) (?:matter|request|task|project|operation|acquisition)|entre nous|(?:urgent|important|strictement|reste|c'est) (?:et )?confidentiel\w*|n'en parle\w* a personne|ne (?:le |l'|en )?\w+ a personne|garde\w* (?:ca|cela|le) pour (?:toi|vous)|en toute discretion)\b/g;
const UNAVAILABLE =
  /\b(?:i'?m in a meeting|in meetings all day|(?:can'?t|cannot|unable to) (?:take|answer) (?:calls|the phone)|(?:can'?t|cannot|unable to) talk|don'?t call|do not call|je suis en reunion|en reunion toute la journee|en deplacement|injoignable|pas joignable|ne m'appel\w* pas|ne pas m'appeler|(?:je ne peux|ne peux) pas (?:repondre|parler|telephoner))\b/g;
const OPENER =
  /\b(?:are you (?:available|at your desk|in the office)|(?:quick|small) favou?r|i need you to|j'ai besoin que (?:tu|vous)|(?:un )?petit service|(?:es-tu|etes-vous|tu es|vous etes) dispo\w*)\b/g;
const URGENCY =
  /\b(?:urgent\w*|asap|as soon as possible|right away|immediately|within the hour|before tonight|today|aujourd'hui|immediatement|tout de suite|au plus vite|dans l'heure|sans delai|avant ce soir)\b/g;

const WINDOW = 120;

type Hit = { start: number; end: number };

function first(pattern: RegExp, folded: string, accept: (hit: Hit) => boolean = () => true): Hit | null {
  for (const m of folded.matchAll(pattern)) {
    const hit = { start: m.index, end: m.index + m[0].length };
    if (accept(hit)) return hit;
  }
  return null;
}

/**
 * CEO and gift-card fraud carry no link and often no bank details: a
 * request to buy gift cards or crypto, and the pressure that keeps the
 * reader from checking (secrecy, an unreachable sender, a "quick favour").
 * Urgency alone is everyday mail, so it only adds to another signal;
 * newsletters (List-Unsubscribe) and the organisation's own mail are left
 * to other checks.
 */
export function becFindings(input: {
  texts: (string | null)[];
  fromDomain: string | null;
  orgDomains: readonly string[];
  /** Bulk mail: List-Unsubscribe or Precedence: bulk/list. */
  bulk: boolean;
}): Finding[] {
  const { fromDomain, orgDomains } = input;
  if (input.bulk || (fromDomain !== null && orgDomains.some((d) => sameOrg(d, fromDomain)))) return [];

  const quotes: string[] = [];
  let payment = false;
  let urgency = false;
  const pressure = new Set<string>();
  for (const text of input.texts) {
    if (!text) continue;
    const folded = fold(text);
    const note = (hit: Hit | null) => {
      if (hit) quotes.push(quote(text, hit.start, hit.end));
      return hit !== null;
    };
    if (!payment) {
      payment = note(first(UNUSUAL_PAYMENT, folded, (h) => ASKED.test(folded.slice(Math.max(0, h.start - WINDOW), h.end + WINDOW))));
    }
    for (const [name, pattern] of [["secrecy", SECRECY], ["unavailable", UNAVAILABLE], ["opener", OPENER]] as const) {
      if (!pressure.has(name) && note(first(pattern, folded))) pressure.add(name);
    }
    if (!urgency) urgency = first(URGENCY, folded) !== null;
  }

  const free = fromDomain !== null && isFreeMail(fromDomain);
  let severity: Finding["severity"];
  let weight: number;
  if (payment && (pressure.size > 0 || urgency)) [severity, weight] = free ? ["high", 18] : ["medium", 12];
  else if (payment) [severity, weight] = free ? ["medium", 8] : ["low", 5];
  else if (pressure.size + (urgency && pressure.size > 0 ? 1 : 0) >= 2) [severity, weight] = free ? ["high", 15] : ["medium", 10];
  else return [];

  return [{
    id: "content.bec-request",
    category: "content",
    severity,
    title: payment
      ? { en: "Asks for gift cards or crypto", fr: "Demande des cartes cadeaux ou des cryptomonnaies" }
      : { en: "Wording of a CEO fraud", fr: "Formulation d’une fraude au président" },
    explanation: {
      en:
        (payment
          ? "Gift cards and crypto are untraceable and cannot be clawed back, which is why fraudsters impersonating a manager ask for them. "
          : "") +
        "Secrecy, an unreachable sender and a sudden favour are how CEO fraud keeps the reader from checking with anyone." +
        (free ? " It comes from a free webmail address, which anyone can open in someone else's name." : "") +
        " Confirm with the person on a number you already had.",
      fr:
        (payment
          ? "Les cartes cadeaux et les cryptomonnaies sont intraçables et irrécupérables, c’est pourquoi les fraudeurs qui se font passer pour un responsable les réclament. "
          : "") +
        "Le secret, un expéditeur injoignable et un service soudain sont la façon dont la fraude au président empêche le lecteur de vérifier auprès de quiconque." +
        (free ? " Le message provient d’une adresse de messagerie gratuite, que n’importe qui peut ouvrir au nom d’un autre." : "") +
        " Confirmez auprès de la personne, à un numéro que vous aviez déjà.",
    },
    evidence: [...new Set(quotes)].slice(0, 3),
    weight,
  }];
}
