import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/landing.css';

export default function LandingPage() {
  useEffect(() => { document.documentElement.dataset.prerendered = 'true'; }, []);

  return (
    <>
      <title>Open Tome — Self-Hosted Writing Studio</title>
      <meta
        name="description"
        content="Open Tome is a self-hosted, open-source writing studio. Run it on your own server. Your manuscripts stay yours."
      />
      <meta name="robots" content="noindex, nofollow" />

      <div className="landing-page">

        {/* ── Nav ──────────────────────────────────────────────────────────── */}
        <nav className="landing-nav" aria-label="Main navigation">
          <span className="landing-nav-logo">
            Open <span className="landing-nav-logo-accent">Tome</span>
          </span>
          <Link to="/login" className="landing-nav-cta">Open Your Tome</Link>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <main id="main-content" tabIndex={-1}>
          <section className="landing-hero" aria-labelledby="hero-title">

            <div className="tome-rule" aria-hidden="true" />

            <p className="hero-eyebrow">Self-Hosted Writing Studio</p>

            <h1 id="hero-title" className="hero-title">
              Open <span className="hero-title-accent">Tome</span>
            </h1>

            <p className="hero-catchphrase">
              The Tome Is Open.<br />The Rest Is Yours.
            </p>

            <p className="hero-tagline">
              A self-hosted, open-source writing studio. Your server,
              your manuscripts, your rules.
            </p>

            <div className="hero-cta-group">
              <Link to="/login" className="btn-primary">Open Your Tome</Link>
            </div>

            <div className="tome-rule-bottom" aria-hidden="true" />

          </section>
        </main>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="landing-footer">
          <p className="footer-logo">
            Open <span className="footer-logo-accent">Tome</span>
          </p>
          <nav className="footer-links" aria-label="Footer navigation">
            <a
              href="https://github.com/your-org/open-tome"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
          <p className="footer-note">Built in the open. Written in private.</p>
        </footer>

      </div>
    </>
  );
}
