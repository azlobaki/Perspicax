import type { Metadata } from "next";
import Footer from "@/components/Footer";
import { DATA, HEADER, SECTION_TITLE, WORDMARK } from "@/components/ui";
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
    <>
      <header className={HEADER}>
        {/* A plain link: Next's <Link> fetches the next page's data, which the CSP's connect-src 'none' forbids. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={WORDMARK}>
          Perspicax
        </a>
      </header>

      <main lang="fr" className="flex-1 px-4 py-8 sm:px-6 console:py-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight console:text-lg console:font-semibold console:tracking-normal dossier:text-3xl dossier:font-semibold">
          Mentions légales et confidentialité
        </h1>

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
            dans l&apos;autre. Un message noté « Clean » n&apos;est pas pour autant sûr, et un message signalé
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
            <strong>Stockage local.</strong> Si vous modifiez un réglage (thème, domaines de votre organisation,
            neutralisation des indicateurs, services de pivot), il est enregistré dans le stockage local de votre
            navigateur, sous la clé <span className={DATA}>{SETTINGS_KEY}</span>, et nulle part ailleurs. Rien
            n&apos;est écrit tant que vous ne modifiez pas un réglage. Ce stockage sert uniquement à conserver vos
            préférences d&apos;interface ; vous pouvez l&apos;effacer depuis les réglages (« Reset settings ») ou en
            supprimant les données du site dans votre navigateur. Le site ne dépose aucun cookie et n&apos;utilise
            aucune mesure d&apos;audience ni aucun traceur publicitaire.
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
      </main>

      <Footer />
    </>
  );
}
