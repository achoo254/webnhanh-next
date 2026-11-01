import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { translator } from '../i18n';
import { variantChoices } from '../pages/template-variant-choices';
import { AppPage } from '../public-page';
import { GUIDES, guideStartHref, type Guide } from './guide-content';
import { GUIDE_IDS } from './guide-paths';

/** The guide's words are Vietnamese whatever the visitor's language (guide-content.ts), so are the looks' names. */
const vi = translator('vi');

/**
 * A guide page (/thiep-cuoi-online, /website-ban-hang-mien-phi, /thiep-tet-2027): what the template does, its looks
 * (each a link into /new with that look picked), three steps, questions, and the call to action into /new. The build
 * renders it to HTML for crawlers (guide-prerender.tsx); the browser renders the same over it.
 */
export function GuidePage({ guide }: { readonly guide: Guide }): ReactNode {
  useGuideTitle(guide.title);
  const start = guideStartHref(guide);
  const others = GUIDE_IDS.filter((id) => id !== guide.id).map((id) => GUIDES[id]);
  return (
    <AppPage>
      <article className="guide" lang="vi" data-id={`guide-${guide.id}`}>
        <header className="guide-head" data-id="guide-head">
          <p className="eyebrow">{guide.eyebrow}</p>
          <h1 className="page-title">{guide.heading}</h1>
          <p className="lede">{guide.lede}</p>
          <Link className="pill pill-cta guide-cta" to={start} data-id="guide-cta-top">
            {guide.cta}
          </Link>
        </header>

        <section className="guide-looks" aria-labelledby="guide-looks-title" data-id="guide-looks">
          <h2 id="guide-looks-title" className="guide-title">
            {guide.looksHeading}
          </h2>
          <ul className="guide-look-grid">
            {variantChoices(guide.template).map((choice) => (
              <li key={choice.id}>
                <Link className="guide-look" to={guideStartHref(guide, choice.id)} data-id={`guide-look-${choice.id}`}>
                  <img src={choice.thumb} alt={`Mẫu ${vi(choice.label)}`} width={240} height={320} loading="lazy" decoding="async" />
                  <span className="guide-look-name">{vi(choice.label)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {guide.sections.map((section, index) => (
          <section key={section.heading} className="guide-section" data-id={`guide-section-${index + 1}`}>
            <h2 className="guide-title">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.list ? (
              <ul className="guide-list">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <section className="guide-section" aria-labelledby="guide-steps-title" data-id="guide-steps">
          <h2 id="guide-steps-title" className="guide-title">
            Ba bước là xong
          </h2>
          <ol className="how-grid">
            {guide.steps.map((step, index) => (
              <li key={step.title} className="how-step" data-id={`guide-step-${index + 1}`}>
                <span className="how-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="feature-title">{step.title}</h3>
                <p className="feature-text">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="guide-section" aria-labelledby="guide-faq-title" data-id="guide-faq">
          <h2 id="guide-faq-title" className="guide-title">
            Câu hỏi thường gặp
          </h2>
          <dl className="guide-faq">
            {guide.faq.map((item) => (
              <div key={item.question} className="guide-faq-item">
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="guide-end" data-id="guide-end">
          <Link className="pill pill-cta guide-cta" to={start} data-id="guide-cta">
            {guide.cta}
          </Link>
          <p className="hint">Chọn mẫu chưa cần tài khoản. Đăng ký miễn phí khi bạn bấm tạo website.</p>
        </section>

        <nav className="guide-related" aria-labelledby="guide-related-title" data-id="guide-related">
          <h2 id="guide-related-title" className="guide-title">
            Gợi ý khác
          </h2>
          <ul className="guide-related-list">
            {others.map((other) => (
              <li key={other.id}>
                <Link to={other.path} data-id={`guide-related-${other.id}`}>
                  {other.linkLabel}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/new" data-id="guide-related-all">
                Xem mọi mẫu website
              </Link>
            </li>
          </ul>
        </nav>
      </article>
    </AppPage>
  );
}

/**
 * The guide's title in the tab while it is open (the prerendered HTML already has it; this covers arriving from
 * another page of the app), the previous one back when leaving.
 */
function useGuideTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
