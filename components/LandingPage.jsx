'use client';

import { ArrowRight, Building2, EyeOff, Home, Mail, MapPin, ShieldCheck, Sparkles } from 'lucide-react';

function normalizeSiteUrl(siteUrl) {
  if (!siteUrl || siteUrl.startsWith('#update-link')) return null;
  return siteUrl;
}

export default function LandingPage({ portal, sites, photos }) {
  const visibleSites = sites.filter((site) => site.enabled);
  const heroPhoto = photos?.[0]?.src;

  return (
    <main>
      <section className="hero-shell">
        <nav className="topbar">
          <div className="brand">
            <span className="brand-mark"><Building2 size={22} /></span>
            <span>{portal.companyName}</span>
          </div>
          <a className="contact-pill" href={`mailto:${portal.contactEmail}`}>
            <Mail size={16} /> {portal.contactEmail}
          </a>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><Sparkles size={16} /> Central property landing page</p>
            <h1>{portal.headline}</h1>
            <p className="hero-text">{portal.subheadline}</p>
            <div className="hero-actions">
              <a className="primary-button" href="#properties">{portal.ctaPrimaryLabel}<ArrowRight size={18} /></a>
              <a className="secondary-button" href={`mailto:${portal.contactEmail}`}>{portal.ctaSecondaryLabel}</a>
            </div>
            <div className="stats-row">
              {portal.stats.map((stat) => (
                <div className="stat-card" key={stat.label}>
                  <span>{stat.value}</span>
                  <small>{stat.label}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-image-card">
              <img
                src={heroPhoto || '/photos/mississauga-placeholder.svg'}
                alt="BAG Property Holdings portfolio preview"
              />
            </div>
            <div className="floating-note">
              <ShieldCheck size={20} />
              <div>
                <strong>Admin-controlled static portal</strong>
                <span>Show, hide, link, and refresh property cards locally.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="control-strip">
        <article><Home size={20} /><span>Public-facing portfolio home</span></article>
        <article><Building2 size={20} /><span>Connects to dedicated site pages</span></article>
        <article><EyeOff size={20} /><span>Exclude any listing with one admin toggle</span></article>
      </section>

      <section className="properties-section" id="properties">
        <div className="section-heading">
          <p className="eyebrow">Current visible sites</p>
          <h2>Property pages connected from one place</h2>
          <p>Each card can be edited in the local admin panel, including cover photo, status, summary, and the published property-page link.</p>
        </div>

        {visibleSites.length > 0 ? (
          <div className="property-grid">
            {visibleSites.map((site) => {
              const activeUrl = normalizeSiteUrl(site.siteUrl);
              return (
                <article className="property-card" key={site.id}>
                  <div className="property-image-wrap">
                    <img src={site.coverImage} alt={`${site.title} cover`} />
                    <span className="badge">{site.badge}</span>
                  </div>
                  <div className="property-body">
                    <div className="meta-line"><MapPin size={16} /> {site.location}</div>
                    <h3>{site.title}</h3>
                    <p>{site.summary}</p>
                    <div className="property-details">
                      <strong>{site.price}</strong>
                      <span>{site.availability}</span>
                    </div>
                    <ul>
                      {site.features?.slice(0, 3).map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                    {site.galleryImages?.length > 0 ? (
                      <div className="property-gallery" aria-label={`${site.title} photo gallery`}>
                        {site.galleryImages.slice(0, 10).map((image, index) => (
                          <figure className="property-gallery-item" key={`${site.id}-gallery-${index}`}>
                            <img
                              src={image.src}
                              alt={image.alt || `${site.title} property photo ${index + 1}`}
                              loading="lazy"
                            />
                          </figure>
                        ))}
                      </div>
                    ) : null}
                    {activeUrl ? (
                      <a className="card-button" href={activeUrl}>Open property site <ArrowRight size={17} /></a>
                    ) : (
                      <span className="card-button disabled">Admin: add published site link</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">No property pages are currently visible. Turn one on through the admin portal.</div>
        )}
      </section>

      <section className="footer-cta">
        <div>
          <p className="eyebrow">Portfolio inquiries</p>
          <h2>Contact BAG Property Holdings</h2>
          <p>{portal.notice}</p>
        </div>
        <a className="primary-button" href={`mailto:${portal.contactEmail}`}><Mail size={18} /> Email {portal.contactEmail}</a>
      </section>
    </main>
  );
}
