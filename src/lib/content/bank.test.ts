import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenceIn } from "../finding.ts";
import { bankChangeFindings } from "./bank.ts";

const check = (text: string, fromDomain: string | null = "gmail.com", orgDomains: string[] = []) =>
  bankChangeFindings({ texts: [text], fromDomain, orgDomains });

test("flags a payroll diversion request sent from webmail", () => {
  const [finding] = check(
    "Bonjour Anne\nJe t'écris ce jour car je souhaite mettre à jour mes informations bancaires avant ma paie de ce mois.",
  );
  assert.equal(finding.id, "content.payment-details");
  assert.equal(finding.category, "content");
  assert.equal(finding.severity, "high");
  assert.equal(finding.weight, 20);
  assert.match(evidenceIn(finding.evidence[0], "en"), /mettre à jour mes informations bancaires/);
});

test("reads English requests too", () => {
  for (const text of [
    "Hi, please update my direct deposit information before the next payroll run.",
    "Kindly note our new bank details for all future invoice payments.",
    "I changed banks, can you send my salary to this new account number?",
    "We have switched our banking information, see the attached IBAN.",
  ]) {
    assert.equal(check(text, "outlook.com").length, 1, text);
  }
});

test("reads French variants, whatever the case and accents", () => {
  for (const text of [
    "Veuillez trouver ci-joint notre NOUVEAU RIB pour les prochains règlements.",
    "Suite à un changement de banque, nos COORDONNÉES BANCAIRES ont été modifiées.",
    "Merci d'effectuer le virement sur l'IBAN ci-dessous.",
  ]) {
    assert.equal(check(text).length, 1, text);
  }
});

test("weighs less when the sender has a domain of its own", () => {
  const [finding] = check("Notre RIB a changé, merci de mettre à jour vos fichiers.", "fournisseur-btp.fr");
  assert.equal(finding.severity, "medium");
  assert.equal(finding.weight, 10);
});

test("trusts the organisation's own domains", () => {
  assert.deepEqual(check("Mettez à jour votre RIB dans le portail RH.", "rh.rhone-energie.fr", ["rhone-energie.fr"]), []);
});

test("needs the bank words and the change close together", () => {
  const filler = " Lorem ipsum dolor sit amet, consectetur adipiscing elit.".repeat(6);
  assert.deepEqual(check(`Découvrez notre nouvelle collection d'automne.${filler} Paiement sécurisé par compte bancaire.`), []);
  assert.deepEqual(check("Your monthly statement is ready. Nothing changes for you."), []);
  assert.deepEqual(check("Our bank details are in the footer.", "outlook.com"), []);
});

test("quotes the request in the evidence, without the rest of the email", () => {
  const long = `${"Intro. ".repeat(60)}Je souhaite modifier mon RIB.${" Fin.".repeat(60)}`;
  const [finding] = check(long);
  const quote = evidenceIn(finding.evidence[0], "en");
  assert.ok(quote.length <= 220, quote);
  assert.match(quote, /modifier mon RIB/);
});
