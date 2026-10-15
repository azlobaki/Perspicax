import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
import { DATA, SECTION_TITLE } from "@/components/ui";
import { SETTINGS_KEY } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Mentions légales et confidentialité — Perspicax",
  description: "Éditeur, hébergeur, limites de l'outil et données personnelles.",
};

const CONTACT = "contact.azlobaki@pm.me";

const PARAGRAPH = "mt-2 max-w-prose";
const SECTION = "mt-10 console:mt-6";

export default function LegalNotice() {
  return (
    <LegalShell>
      <main className="flex-1 px-4 py-8 sm:px-6 console:py-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight console:text-lg console:font-semibold console:tracking-normal dossier:text-3xl dossier:font-semibold">
          <span data-locale="fr">Mentions légales et confidentialité</span>
          <span data-locale="en">Legal notice and privacy</span>
        </h1>

        <article lang="fr" data-locale="fr">

          <section className={SECTION} aria-labelledby="editeur">
            <h2 id="editeur" className={SECTION_TITLE}>
              Éditeur
            </h2>
            <p className={PARAGRAPH}>
              Ce site est édité par un particulier, à titre non professionnel, qui a choisi de rester anonyme comme le
              permet l&apos;article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans
              l&apos;économie numérique. Ses éléments d&apos;identification ont été communiqués à l&apos;hébergeur.
            </p>
            <p className={PARAGRAPH}>
              Contact : <span className={DATA}>{CONTACT}</span>
            </p>
          </section>

          <section className={SECTION} aria-labelledby="hebergeur">
            <h2 id="hebergeur" className={SECTION_TITLE}>
              Hébergeur
            </h2>
            <address className={`${PARAGRAPH} not-italic`}>
              Vercel Inc.
              <br />
              440 N Barranca Avenue #4133
              <br />
              Covina, CA 91723, États-Unis
              <br />
              Téléphone : +1 951-383-6898
              <br />
              <span className={DATA}>https://vercel.com</span>
            </address>
          </section>

          <section className={SECTION} aria-labelledby="avertissement">
            <h2 id="avertissement" className={SECTION_TITLE}>
              Avertissement — limites de l&apos;outil
            </h2>
            <p className={PARAGRAPH}>
              Perspicax est un outil d&apos;aide à l&apos;analyse des e-mails suspects. Ses verdicts, scores et constats
              reposent sur des heuristiques automatiques : ils peuvent être incomplets ou erronés, dans un sens comme
              dans l&apos;autre. Un message noté « Sain » n&apos;est pas pour autant sûr, et un message signalé
              n&apos;est pas nécessairement malveillant.
            </p>
            <p className={PARAGRAPH}>
              L&apos;outil n&apos;est pas une fin en soi. Il ne remplace pas l&apos;analyse d&apos;une personne qualifiée
              ni les procédures de sécurité de votre organisation, et ne doit pas servir à s&apos;y soustraire. Les
              décisions prises au vu de ses résultats — ouvrir, supprimer, bloquer ou signaler un message, cliquer sur
              un lien, ouvrir une pièce jointe — relèvent de la seule responsabilité de l&apos;utilisateur.
            </p>
            <p className={PARAGRAPH}>
              Le logiciel est fourni « en l&apos;état », sans garantie d&apos;aucune sorte, conformément à sa licence
              (GNU AGPL v3, articles 15 et 16). Dans les limites permises par la loi, l&apos;éditeur ne saurait être
              tenu responsable des dommages résultant de son utilisation.
            </p>
            <p className={PARAGRAPH}>
              Un e-mail réellement malveillant peut contenir des liens et des pièces jointes dangereux : ne les ouvrez
              pas en dehors d&apos;un environnement prévu pour cela.
            </p>
          </section>

          <section className={SECTION} aria-labelledby="donnees">
            <h2 id="donnees" className={SECTION_TITLE}>
              Données personnelles
            </h2>
            <p className={PARAGRAPH}>
              <strong>E-mails analysés.</strong> L&apos;analyse a lieu entièrement dans votre navigateur. Le contenu des
              messages n&apos;est envoyé à aucun serveur et n&apos;est pas conservé : il disparaît au rechargement ou à
              la fermeture de la page. Une politique de sécurité du contenu interdit au navigateur toute connexion
              réseau depuis la page.
            </p>
            <p className={PARAGRAPH}>
              <strong>Stockage local.</strong> Si vous modifiez un réglage (thème, langue de l’interface, domaines de
              votre organisation, noms à protéger, neutralisation des indicateurs, services de pivot), il est enregistré
              dans le stockage local de votre navigateur, sous la clé <span className={DATA}>{SETTINGS_KEY}</span>, et nulle
              part ailleurs. Rien
              n&apos;est écrit tant que vous ne modifiez pas un réglage. Les noms à protéger sont des données personnelles
              que vous saisissez vous-même : ils servent uniquement à la comparaison faite dans votre navigateur et
              n&apos;en sortent pas. Ce stockage sert uniquement à conserver vos
              préférences d&apos;interface ; vous pouvez l&apos;effacer depuis les réglages (« Réinitialiser les
              réglages ») ou en supprimant les données du site dans votre navigateur. Le site ne dépose
              aucun cookie et n&apos;utilise aucune mesure d&apos;audience ni aucun traceur publicitaire.
            </p>
            <p className={PARAGRAPH}>
              <strong>Journaux d&apos;hébergement.</strong> Comme tout hébergeur, Vercel enregistre les requêtes reçues
              (adresse IP, date, page demandée, navigateur) pour assurer le fonctionnement et la sécurité du service.
              Ces données sont traitées par Vercel Inc., dont les serveurs peuvent se trouver hors de l&apos;Union
              européenne ; Vercel adhère au cadre de protection des données UE–États-Unis (Data Privacy Framework).
              L&apos;éditeur n&apos;exploite pas ces journaux.
            </p>
            <p className={PARAGRAPH}>
              <strong>Services de pivot.</strong> Les boutons de pivot (VirusTotal, urlscan, etc.) ouvrent le service
              choisi dans un nouvel onglet ; l&apos;indicateur concerné lui est alors transmis, à votre initiative et
              selon la politique de ce service. Rien n&apos;est transmis tant que vous ne cliquez pas.
            </p>
            <p className={PARAGRAPH}>
              <strong>Vos droits.</strong> Vous pouvez exercer vos droits d&apos;accès, de rectification,
              d&apos;effacement, de limitation et d&apos;opposition en écrivant à{" "}
              <span className={DATA}>{CONTACT}</span>, et introduire une réclamation auprès de la CNIL (cnil.fr).
            </p>
          </section>

          <section className={SECTION} aria-labelledby="source">
            <h2 id="source" className={SECTION_TITLE}>
              Code source
            </h2>
            <p className={PARAGRAPH}>
              Logiciel libre sous licence GNU Affero General Public License v3 :{" "}
              <span className={DATA}>https://github.com/azlobaki/Perspicax</span>
            </p>
          </section>
        </article>

        <article lang="en" data-locale="en">
          <p className={PARAGRAPH}>
            <em>This translation is provided for convenience; the French text is the legally binding one.</em>
          </p>

          <section className={SECTION} aria-labelledby="en-publisher">
            <h2 id="en-publisher" className={SECTION_TITLE}>
              Publisher
            </h2>
            <p className={PARAGRAPH}>
              This site is published by a private individual, on a non-professional basis, who has chosen to remain
              anonymous as permitted by Article 6, III, 2 of French law no. 2004-575 of 21 June 2004 on confidence in
              the digital economy (LCEN). Their identification details have been provided to the host.
            </p>
            <p className={PARAGRAPH}>
              Contact: <span className={DATA}>{CONTACT}</span>
            </p>
          </section>

          <section className={SECTION} aria-labelledby="en-host">
            <h2 id="en-host" className={SECTION_TITLE}>
              Host
            </h2>
            <address className={`${PARAGRAPH} not-italic`}>
              Vercel Inc.
              <br />
              440 N Barranca Avenue #4133
              <br />
              Covina, CA 91723, United States
              <br />
              Telephone: +1 951-383-6898
              <br />
              <span className={DATA}>https://vercel.com</span>
            </address>
          </section>

          <section className={SECTION} aria-labelledby="en-disclaimer">
            <h2 id="en-disclaimer" className={SECTION_TITLE}>
              Disclaimer — the tool&apos;s limits
            </h2>
            <p className={PARAGRAPH}>
              Perspicax is a tool that helps analyse suspicious emails. Its verdicts, scores and findings rely on
              automatic heuristics: they may be incomplete or wrong, in either direction. A message rated
              &ldquo;Clean&rdquo; is not necessarily safe, and a message that is flagged is not necessarily malicious.
            </p>
            <p className={PARAGRAPH}>
              The tool is not an end in itself. It does not replace the analysis of a qualified person or your
              organisation&apos;s security procedures, and must not be used to bypass them. Decisions taken on the
              strength of its results — opening, deleting, blocking or reporting a message, clicking a link, opening an
              attachment — are the sole responsibility of the user.
            </p>
            <p className={PARAGRAPH}>
              The software is provided &ldquo;as is&rdquo;, without warranty of any kind, in accordance with its licence
              (GNU AGPL v3, articles 15 and 16). To the extent permitted by law, the publisher cannot be held liable for
              damage resulting from its use.
            </p>
            <p className={PARAGRAPH}>
              A genuinely malicious email may contain dangerous links and attachments: do not open them outside an
              environment designed for that purpose.
            </p>
          </section>

          <section className={SECTION} aria-labelledby="en-data">
            <h2 id="en-data" className={SECTION_TITLE}>
              Personal data
            </h2>
            <p className={PARAGRAPH}>
              <strong>Analysed emails.</strong> The analysis takes place entirely in your browser. The content of the
              messages is not sent to any server and is not kept: it disappears when you reload or close the page. A
              content security policy forbids the browser from making any network connection from the page.
            </p>
            <p className={PARAGRAPH}>
              <strong>Local storage.</strong> If you change a setting (theme, interface language, your
              organisation&apos;s domains, names to protect, defanging of indicators, pivot services), it is saved in
              your browser&apos;s local storage, under
              the key <span className={DATA}>{SETTINGS_KEY}</span>, and nowhere else. Nothing is written until you
              change a setting. The names to protect are personal data that you enter yourself: they are used only for
              the comparison carried out in your browser and never leave it. This storage is used only to keep your
              interface preferences; you can erase it from the settings (&ldquo;Reset settings&rdquo;) or by deleting
              the site&apos;s data in your browser. The site sets no cookies and uses no audience measurement or
              advertising trackers.
            </p>
            <p className={PARAGRAPH}>
              <strong>Hosting logs.</strong> Like any host, Vercel records the requests it receives (IP address, date,
              requested page, browser) to keep the service running and secure. These data are processed by Vercel Inc.,
              whose servers may be located outside the European Union; Vercel adheres to the EU–US Data Privacy
              Framework. The publisher does not use these logs.
            </p>
            <p className={PARAGRAPH}>
              <strong>Pivot services.</strong> The pivot buttons (VirusTotal, urlscan, etc.) open the chosen service in
              a new tab; the indicator concerned is then passed to it, at your initiative and subject to that
              service&apos;s policy. Nothing is passed on until you click.
            </p>
            <p className={PARAGRAPH}>
              <strong>Your rights.</strong> You may exercise your rights of access, rectification, erasure,
              restriction and objection by writing to <span className={DATA}>{CONTACT}</span>, and lodge a complaint
              with the CNIL (cnil.fr).
            </p>
          </section>

          <section className={SECTION} aria-labelledby="en-source">
            <h2 id="en-source" className={SECTION_TITLE}>
              Source code
            </h2>
            <p className={PARAGRAPH}>
              Free software under the GNU Affero General Public License v3:{" "}
              <span className={DATA}>https://github.com/azlobaki/Perspicax</span>
            </p>
          </section>
        </article>
      </main>
    </LegalShell>
  );
}
