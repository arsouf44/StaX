import { formatMoney } from '@stax/payments/money';
import type { ParsedBlock } from '../blocks/registry';
import type { BlockSettings } from '../blocks/primitives';
import { absoluteUrl } from '../seo';
import { attrs, cls, html, join, raw, type RawHtml } from './html';
import type {
  ContentEntryView,
  MediaImage,
  MenuCategoryView,
  RenderContext,
  ServiceItem,
} from './context';

/**
 * Rendu des blocs.
 *
 * Chaque bloc recoit des proprietes DEJA validees par son schema Zod : ce
 * module n a donc pas a se defendre contre des formes inattendues, seulement a
 * echapper correctement — ce dont `html` se charge par construction.
 *
 * Les blocs qui dependent de donnees vivantes (carte, prestations, produits)
 * lisent `context.data`. Quand la collection est vide, le bloc ne rend RIEN
 * plutot qu une section decorative sans contenu : un site en ligne ne doit
 * jamais afficher « Aucun element » a un visiteur.
 */

/* --- Utilitaires partages ------------------------------------------------- */

type Props = Record<string, unknown>;

const str = (props: Props, key: string): string =>
  typeof props[key] === 'string' ? (props[key] as string) : '';

const bool = (props: Props, key: string, fallback = false): boolean =>
  typeof props[key] === 'boolean' ? (props[key] as boolean) : fallback;

const num = (props: Props, key: string, fallback: number): number =>
  typeof props[key] === 'number' ? (props[key] as number) : fallback;

const arr = <T>(props: Props, key: string): T[] =>
  Array.isArray(props[key]) ? (props[key] as T[]) : [];

interface LinkProp {
  label: string;
  href: string;
  style: 'primary' | 'secondary' | 'ghost' | 'link';
  external: boolean;
}

interface MediaProp {
  mediaId: string | null;
  url?: string | null;
  alt: string;
  width?: number;
  height?: number;
}

/** Prix affiche a partir de centimes. Aucune division manuelle par 100. */
function price(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents === null || cents === undefined) return '';
  return formatMoney(cents, currency as 'EUR', { hideDecimalsWhenRound: true });
}

function media(value: MediaProp | MediaImage | null | undefined): MediaImage | null {
  if (!value) return null;
  const url = 'url' in value ? value.url : null;
  if (!url) return null;
  return {
    url,
    alt: value.alt ?? '',
    ...(value.width ? { width: value.width } : {}),
    ...(value.height ? { height: value.height } : {}),
  };
}

/**
 * Image. `loading` est explicite : la premiere image d une page doit etre
 * chargee immediatement (elle est souvent l element le plus grand affiche),
 * les suivantes en differe.
 */
function img(image: MediaImage | null, className: string, eager = false): RawHtml {
  if (!image) return raw('');
  return html`<img
    src="${image.url}"
    alt="${image.alt}"
    class="${className}"
    ${attrs({
      width: image.width ?? false,
      height: image.height ?? false,
      loading: eager ? 'eager' : 'lazy',
      decoding: 'async',
      fetchpriority: eager ? 'high' : false,
    })}
  />`;
}

function button(link: LinkProp): RawHtml {
  const external = link.external || link.href.startsWith('https://');
  return html`<a
    class="btn btn-${link.style}"
    href="${link.href}"
    ${attrs({
      target: external ? '_blank' : false,
      rel: external ? 'noopener noreferrer' : false,
    })}
    >${link.label}</a
  >`;
}

function actions(links: LinkProp[]): RawHtml {
  if (links.length === 0) return raw('');
  return html`<div class="row">${join(links.map(button))}</div>`;
}

function heading(title: string, subtitle: string, eyebrow = ''): RawHtml {
  if (!title && !subtitle) return raw('');
  return html`<div class="head">
    ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
    ${title ? html`<h2>${title}</h2>` : ''} ${subtitle ? html`<p class="lede">${subtitle}</p>` : ''}
  </div>`;
}

const COLUMN_CLASS: Record<number, string> = { 2: 'g2', 3: 'g3', 4: 'g4' };

/** Rend un texte riche structure. Aucun HTML libre n est jamais interprete. */
function richText(
  blocks: Array<{ kind: string; text: string; items?: string[]; level?: number }>,
): RawHtml {
  return join(
    blocks.map((node) => {
      if (node.kind === 'heading') {
        const level = node.level === 4 ? 4 : node.level === 3 ? 3 : 2;
        if (level === 2) return html`<h2>${node.text}</h2>`;
        if (level === 3) return html`<h3>${node.text}</h3>`;
        return html`<h4>${node.text}</h4>`;
      }
      if (node.kind === 'list') {
        return html`<ul>
          ${join((node.items ?? []).map((item) => html`<li>${item}</li>`))}
        </ul>`;
      }
      if (node.kind === 'quote') return html`<blockquote>${node.text}</blockquote>`;
      return html`<p>${node.text}</p>`;
    }),
  );
}

/* --- Enveloppe de section ------------------------------------------------- */

const BG_CLASS: Record<string, string> = {
  default: '',
  none: '',
  surface: 'bg-surface',
  contrast: 'bg-contrast',
  accent: 'bg-accent',
  image: '',
};

const SPACING_CLASS: Record<string, string> = {
  none: 'sec-none',
  compact: 'sec-compact',
  default: '',
  roomy: 'sec-roomy',
};

function section(settings: BlockSettings, body: RawHtml, extraClass = ''): RawHtml {
  if (!body.value.trim()) return raw('');
  return html`<section
    class="${cls(
      'sec',
      BG_CLASS[settings.background] ?? '',
      SPACING_CLASS[settings.spacing] ?? '',
      settings.align === 'center' && 'ta-center',
      settings.reveal && 'rv',
      extraClass,
    )}"
    ${attrs({ id: settings.anchorId || false, 'data-reveal': settings.reveal ? 'true' : false })}
  >
    <div class="wrap w-${settings.width}">${body}</div>
  </section>`;
}

/* --- Blocs ---------------------------------------------------------------- */

function renderHero(props: Props, context: RenderContext): RawHtml {
  const layout = str(props, 'layout') || 'centered';
  const cover = media(props['media'] as MediaProp | null);
  const links = arr<LinkProp>(props, 'actions');
  const highlights = arr<string>(props, 'highlights');

  const text = html`
    ${str(props, 'eyebrow') ? html`<p class="eyebrow">${str(props, 'eyebrow')}</p>` : ''}
    <h1>${str(props, 'title') || context.siteName}</h1>
    ${str(props, 'subtitle') ? html`<p class="lede">${str(props, 'subtitle')}</p>` : ''}
    ${actions(links)}
    ${
      highlights.length > 0
        ? html`<ul class="highlights">
            ${join(highlights.map((h) => html`<li>${h}</li>`))}
          </ul>`
        : ''
    }
  `;

  if (layout === 'overlay' && cover) {
    return html`<section class="hero hero-overlay">
      <div class="hero-media">${img(cover, '', true)}</div>
      <div class="wrap w-default ta-center">${text}</div>
    </section>`;
  }

  if (layout === 'split' && cover) {
    return html`<section class="hero">
      <div class="wrap w-wide">
        <div class="hero-split">
          <div>${text}</div>
          ${img(cover, '', true)}
        </div>
      </div>
    </section>`;
  }

  return html`<section class="hero ${layout === 'centered' ? 'ta-center' : ''}">
    <div class="wrap ${layout === 'minimal' ? 'w-narrow' : 'w-default'}">${text}</div>
  </section>`;
}

function renderIntro(props: Props): RawHtml {
  const cover = media(props['media'] as MediaProp | null);
  const position = str(props, 'mediaPosition') || 'right';
  const action = props['action'] as LinkProp | null;
  const body = html`
    ${str(props, 'title') ? html`<h2>${str(props, 'title')}</h2>` : ''}
    <div class="prose">${richText(arr(props, 'body'))}</div>
    ${action ? html`<div class="row" style="margin-top:1.5rem">${button(action)}</div>` : ''}
  `;

  if (!cover || position === 'none') return body;
  return html`<div class="media-split ${position === 'left' ? 'rev' : ''}">
    <div>${body}</div>
    ${img(cover, '')}
  </div>`;
}

function renderGallery(props: Props): RawHtml {
  const items = arr<MediaProp>(props, 'items')
    .map(media)
    .filter((item): item is MediaImage => item !== null);
  if (items.length === 0) return raw('');

  const layout = str(props, 'layout') || 'grid';
  const columns = COLUMN_CLASS[num(props, 'columns', 3)] ?? 'g3';
  const figures = items.map((item) => html`<figure>${img(item, '')}</figure>`);

  if (layout === 'strip' || layout === 'carousel') {
    return html`
      ${str(props, 'title') ? html`<h2>${str(props, 'title')}</h2>` : ''}
      <div class="gal-strip" role="region" aria-label="Galerie photos" tabindex="0">
        ${join(figures)}
      </div>
    `;
  }

  return html`
    ${str(props, 'title') ? html`<h2>${str(props, 'title')}</h2>` : ''}
    <div
      class="gal ${columns} ${layout === 'mosaic' ? 'gal-mosaic' : ''}"
      style="margin-top:1.5rem"
    >
      ${join(figures)}
    </div>
  `;
}

function renderFeatures(props: Props): RawHtml {
  const items = arr<{ icon: string; title: string; description: string }>(props, 'items');
  if (items.length === 0) return raw('');
  const columns = COLUMN_CLASS[num(props, 'columns', 3)] ?? 'g3';
  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <div class="${columns} grid" style="margin-top:2.5rem">
      ${join(
        items.map(
          (item) =>
            html`<div class="feat">
              <span class="feat-ico" aria-hidden="true">${checkIcon()}</span>
              <h3>${item.title}</h3>
              <p class="muted">${item.description}</p>
            </div>`,
        ),
      )}
    </div>
  `;
}

function renderTrust(props: Props): RawHtml {
  const items = arr<{ label: string; value: string }>(props, 'items');
  if (items.length === 0) return raw('');
  return html`<div class="stats">
    ${join(
      items.map(
        (item) =>
          html`<div>
            ${item.value ? html`<p class="stat-v">${item.value}</p>` : ''}
            <p class="stat-l">${item.label}</p>
          </div>`,
      ),
    )}
  </div>`;
}

function renderProcess(props: Props): RawHtml {
  const steps = arr<{ title: string; description: string }>(props, 'steps');
  if (steps.length === 0) return raw('');
  return html`
    ${heading(str(props, 'title'), '')}
    <div class="steps" style="margin-top:2.5rem">
      ${join(
        steps.map(
          (step) =>
            html`<div class="step">
              <h3>${step.title}</h3>
              <p>${step.description}</p>
            </div>`,
        ),
      )}
    </div>
  `;
}

function serviceLine(service: ServiceItem, showPrice: boolean, showDuration: boolean): RawHtml {
  const amount = service.priceCents === null ? 'Sur devis' : price(service.priceCents);
  const prefix = service.priceFrom && service.priceCents !== null ? 'À partir de ' : '';
  return html`<div class="price-row">
    <div>
      <p><strong>${service.name}</strong></p>
      ${service.description ? html`<p class="price-meta">${service.description}</p>` : ''}
      ${
        showDuration && service.durationMinutes
          ? html`<p class="price-meta">${formatDuration(service.durationMinutes)}</p>`
          : ''
      }
    </div>
    <span class="dots" aria-hidden="true"></span>
    ${
      showPrice
        ? html`<span class="price-amt"
            >${prefix}${amount}${service.priceSuffix ? html` ${service.priceSuffix}` : ''}</span
          >`
        : ''
    }
  </div>`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

function renderServices(props: Props, context: RenderContext): RawHtml {
  const filter = arr<string>(props, 'categoryFilter');
  const services = context.data.services.filter(
    (service) =>
      filter.length === 0 || (service.category !== null && filter.includes(service.category)),
  );
  if (services.length === 0) return raw('');

  const showPrices = bool(props, 'showPrices', true);
  const showDurations = bool(props, 'showDurations', true);
  const layout = str(props, 'layout') || 'cards';
  const head = heading(str(props, 'title'), str(props, 'subtitle'));

  if (layout === 'cards') {
    return html`
      ${head}
      <div class="g3 grid" style="margin-top:2.5rem">
        ${join(
          services.map(
            (service) =>
              html`<article class="card item">
                ${service.image ? img(service.image, 'item-media') : ''}
                <h3>${service.name}</h3>
                ${service.description ? html`<p>${service.description}</p>` : ''}
                <p class="item-meta">
                  ${
                    showPrices
                      ? html`<span class="item-price"
                          >${
                            service.priceCents === null
                              ? 'Sur devis'
                              : `${service.priceFrom ? 'À partir de ' : ''}${price(service.priceCents)}`
                          }</span
                        >`
                      : ''
                  }
                  ${
                    showDurations && service.durationMinutes
                      ? html`<span>${formatDuration(service.durationMinutes)}</span>`
                      : ''
                  }
                </p>
              </article>`,
          ),
        )}
      </div>
    `;
  }

  return html`
    ${head}
    <div class="price-list" style="margin-top:2rem">
      ${join(services.map((service) => serviceLine(service, showPrices, showDurations)))}
    </div>
  `;
}

function renderPricing(props: Props): RawHtml {
  const plans = arr<{
    name: string;
    price: string;
    period: string;
    description: string;
    features: string[];
    highlighted: boolean;
    action: LinkProp | null;
  }>(props, 'plans');
  if (plans.length === 0) return raw('');

  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <div class="${plans.length >= 3 ? 'g3' : 'g2'} grid" style="margin-top:2.5rem">
      ${join(
        plans.map(
          (plan) =>
            html`<div class="card plan ${plan.highlighted ? 'plan-hl' : ''}">
              <div>
                <h3>${plan.name}</h3>
                ${plan.price ? html`<p class="plan-price">${plan.price}</p>` : ''}
                ${plan.period ? html`<p class="muted" style="font-size:.875rem">${plan.period}</p>` : ''}
              </div>
              ${plan.description ? html`<p class="muted">${plan.description}</p>` : ''}
              ${
                plan.features.length > 0
                  ? html`<ul>
                      ${join(plan.features.map((feature) => html`<li>${feature}</li>`))}
                    </ul>`
                  : ''
              }
              ${plan.action ? button(plan.action) : ''}
            </div>`,
        ),
      )}
    </div>
  `;
}

function stars(rating: number | null): RawHtml {
  if (rating === null) return raw('');
  return html`<span class="stars" role="img" aria-label="${rating} étoiles sur 5"
    >${join(Array.from({ length: rating }, () => raw('&#9733;')))}</span
  >`;
}

function renderTestimonials(props: Props, context: RenderContext): RawHtml {
  const inline = arr<{
    quote: string;
    author: string;
    role: string;
    rating: number | null;
    date: string;
  }>(props, 'items');

  const fromDatabase = context.data.entries
    .filter((entry) => entry.collection === 'testimonial')
    .map((entry) => ({
      quote: entry.excerpt ?? '',
      author: entry.title,
      role:
        typeof entry.attributes['role'] === 'string' ? (entry.attributes['role'] as string) : '',
      rating:
        typeof entry.attributes['rating'] === 'number'
          ? (entry.attributes['rating'] as number)
          : null,
      date: entry.publishedAt ?? '',
    }));

  const items = [...inline, ...fromDatabase].filter((item) => item.quote.trim().length > 0);
  if (items.length === 0) return raw('');

  return html`
    ${heading(str(props, 'title'), '')}
    <div class="${items.length >= 3 ? 'g3' : 'g2'} grid" style="margin-top:2.5rem">
      ${join(
        items.map(
          (item) =>
            html`<figure class="card quote">
              ${stars(item.rating)}
              <blockquote>${item.quote}</blockquote>
              <figcaption>
                <strong>${item.author}</strong>${item.role ? html` — ${item.role}` : ''}
              </figcaption>
            </figure>`,
        ),
      )}
    </div>
  `;
}

function renderFaq(props: Props, context: RenderContext): RawHtml {
  const inline = arr<{ question: string; answer: string }>(props, 'items');
  const fromDatabase = context.data.entries
    .filter((entry) => entry.collection === 'faq')
    .map((entry) => ({ question: entry.title, answer: entry.excerpt ?? '' }));
  const items = [...inline, ...fromDatabase].filter((item) => item.question && item.answer);
  if (items.length === 0) return raw('');

  return html`
    ${heading(str(props, 'title'), '')}
    <div style="margin-top:2rem;max-width:52rem">
      ${join(
        items.map(
          (item) =>
            html`<details class="faq">
              <summary>${item.question}</summary>
              <p>${item.answer}</p>
            </details>`,
        ),
      )}
    </div>
  `;
}

function renderCta(props: Props): RawHtml {
  const links = arr<LinkProp>(props, 'actions');
  if (!str(props, 'title') && links.length === 0) return raw('');
  return html`<div class="ta-center">
    ${str(props, 'title') ? html`<h2>${str(props, 'title')}</h2>` : ''}
    ${str(props, 'subtitle') ? html`<p class="lede">${str(props, 'subtitle')}</p>` : ''}
    <div style="margin-top:2rem;display:flex;justify-content:center">${actions(links)}</div>
  </div>`;
}

function checkIcon(): RawHtml {
  return raw(
    '<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">' +
      '<path d="M6.2 11.3 3.3 8.4l1.06-1.06 1.84 1.84 4.44-4.44 1.06 1.06z"/></svg>',
  );
}

/* --- Formulaires ---------------------------------------------------------- */

const INPUT_TYPES = new Set(['text', 'email', 'tel', 'number', 'date', 'time', 'datetime']);

function formField(field: {
  name: string;
  label: string;
  type: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  options: Array<{ value: string; label: string }>;
}): RawHtml {
  const id = `f-${field.name}`;
  const describedBy = field.helpText ? `${id}-hint` : undefined;
  const common = attrs({
    id,
    name: field.name,
    required: field.isRequired,
    placeholder: field.placeholder ?? false,
    'aria-describedby': describedBy ?? false,
  });

  const label = html`<label for="${id}"
    >${field.label}${field.isRequired ? html`<span aria-hidden="true"> *</span>` : ''}</label
  >`;
  const hint = field.helpText
    ? html`<p class="hint" id="${id}-hint">${field.helpText}</p>`
    : raw('');

  if (field.type === 'consent') {
    return html`<div class="field">
      <div class="consent">
        <input type="checkbox" ${common} value="1" />
        <label for="${id}">${field.label}</label>
      </div>
      ${hint}
    </div>`;
  }

  if (field.type === 'textarea') {
    return html`<div class="field">${label}<textarea ${common} rows="5"></textarea>${hint}</div>`;
  }

  if (field.type === 'select' || field.type === 'multiselect') {
    return html`<div class="field">
      ${label}
      <select ${common} ${attrs({ multiple: field.type === 'multiselect' })}>
        ${field.isRequired ? '' : html`<option value="">Choisissez…</option>`}
        ${join(field.options.map((o) => html`<option value="${o.value}">${o.label}</option>`))}
      </select>
      ${hint}
    </div>`;
  }

  if (field.type === 'radio') {
    return html`<fieldset class="field" style="border:0;padding:0">
      <legend style="font-size:.875rem;font-weight:500">${field.label}</legend>
      ${join(
        field.options.map(
          (o, index) =>
            html`<div class="consent">
              <input
                type="radio"
                id="${id}-${index}"
                name="${field.name}"
                value="${o.value}"
                ${attrs({ required: field.isRequired && index === 0 })}
              />
              <label for="${id}-${index}">${o.label}</label>
            </div>`,
        ),
      )}
      ${hint}
    </fieldset>`;
  }

  if (field.type === 'checkbox') {
    return html`<div class="field">
      <div class="consent"><input type="checkbox" ${common} value="1" />${label}</div>
      ${hint}
    </div>`;
  }

  const type = INPUT_TYPES.has(field.type) ? field.type : 'text';
  const autocomplete =
    field.name === 'email'
      ? 'email'
      : field.name === 'phone' || field.name === 'telephone'
        ? 'tel'
        : field.name === 'name' || field.name === 'nom'
          ? 'name'
          : undefined;

  return html`<div class="field">
    ${label}
    <input type="${type}" ${common} ${attrs({ autocomplete: autocomplete ?? false })} />
    ${hint}
  </div>`;
}

/**
 * Formulaire public.
 *
 * Il fonctionne SANS JavaScript : la soumission classique du navigateur atteint
 * la meme route que l envoi asynchrone, et la page de retour affiche le meme
 * message. Le script ne fait qu eviter le rechargement.
 *
 * Trois protections sont posees ici et VERIFIEES cote serveur : champ piege,
 * jeton anti-CSRF lie a l origine, et Turnstile lorsqu il est active.
 */
function renderForm(
  context: RenderContext,
  slug: string,
  title: string,
  subtitle: string,
  fallbackKind: 'contact' | 'quote' | 'newsletter',
): RawHtml {
  const form = context.data.forms.find((entry) => entry.slug === slug);
  if (!form) return raw('');

  const submitLabel =
    fallbackKind === 'quote'
      ? 'Demander un devis'
      : fallbackKind === 'newsletter'
        ? 'Je m’inscris'
        : 'Envoyer';

  return html`
    ${heading(title, subtitle)}
    <form
      class="form ${fallbackKind === 'newsletter' ? '' : 'wide'}"
      method="post"
      action="/api/forms/${form.slug}"
      data-stax-form="${form.slug}"
      novalidate
      style="margin-top:2rem"
    >
      <input type="hidden" name="_token" value="${context.formToken}" />
      <input type="hidden" name="_path" value="${context.currentPath}" />
      <div class="hp" aria-hidden="true">
        <label for="hp-${form.slug}">Ne remplissez pas ce champ</label>
        <input
          type="text"
          id="hp-${form.slug}"
          name="${form.honeypotField}"
          tabindex="-1"
          autocomplete="off"
        />
      </div>
      ${join(form.fields.map(formField))}
      ${
        form.requireCaptcha && context.turnstileSiteKey
          ? html`<div
              class="cf-turnstile"
              data-sitekey="${context.turnstileSiteKey}"
              data-theme="${context.theme.scheme}"
            ></div>`
          : ''
      }
      <div class="form-status" data-stax-status hidden role="status"></div>
      <div><button type="submit" class="btn btn-primary">${submitLabel}</button></div>
      <p class="form-note">
        Vos informations servent uniquement à traiter votre demande. Elles ne sont ni revendues ni
        utilisées à d’autres fins.
      </p>
    </form>
  `;
}

function renderContact(props: Props, context: RenderContext): RawHtml {
  const settings = context.settings;
  const form = renderForm(
    context,
    str(props, 'formSlug') || 'contact',
    str(props, 'title'),
    str(props, 'subtitle'),
    'contact',
  );
  if (!bool(props, 'showCoordinates', true)) return form;

  const lines = [
    settings.addressLine1,
    settings.addressLine2,
    [settings.postalCode, settings.city].filter(Boolean).join(' '),
  ].filter((line): line is string => Boolean(line && line.trim()));

  const coordinates = html`<div class="stack">
    ${
      lines.length > 0
        ? html`<div>
            <h3 style="font-size:.9375rem">Adresse</h3>
            <p class="muted" style="margin-top:.35rem">
              ${join(lines.map((line) => html`${line}<br />`))}
            </p>
          </div>`
        : ''
    }
    ${
      settings.phone
        ? html`<div>
            <h3 style="font-size:.9375rem">Téléphone</h3>
            <p style="margin-top:.35rem">
              <a href="tel:${settings.phone.replace(/[^+0-9]/g, '')}">${settings.phone}</a>
            </p>
          </div>`
        : ''
    }
    ${
      settings.email
        ? html`<div>
            <h3 style="font-size:.9375rem">E-mail</h3>
            <p style="margin-top:.35rem">
              <a href="mailto:${settings.email}">${settings.email}</a>
            </p>
          </div>`
        : ''
    }
  </div>`;

  if (!coordinates.value.includes('<h3')) return form;
  return html`<div class="media-split">${form}${coordinates}</div>`;
}

function renderNewsletter(props: Props, context: RenderContext): RawHtml {
  const form = context.data.forms.find((entry) => entry.kind === 'newsletter');
  if (!form) return raw('');
  const consent =
    str(props, 'consentText') ||
    'J’accepte de recevoir des actualités par e-mail. Je peux me désinscrire à tout moment.';

  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <form
      class="form"
      method="post"
      action="/api/forms/${form.slug}"
      data-stax-form="${form.slug}"
      novalidate
      style="margin-top:1.75rem"
    >
      <input type="hidden" name="_token" value="${context.formToken}" />
      <input type="hidden" name="_path" value="${context.currentPath}" />
      <div class="hp" aria-hidden="true">
        <input type="text" name="${form.honeypotField}" tabindex="-1" autocomplete="off" />
      </div>
      <div class="field">
        <label for="nl-email">Votre adresse e-mail</label>
        <input type="email" id="nl-email" name="email" required autocomplete="email" />
      </div>
      <div class="consent">
        <input type="checkbox" id="nl-consent" name="consent" value="1" required />
        <label for="nl-consent">${consent}</label>
      </div>
      <div class="form-status" data-stax-status hidden role="status"></div>
      <div><button type="submit" class="btn btn-primary">Je m’inscris</button></div>
    </form>
  `;
}

/* --- Horaires ------------------------------------------------------------- */

const DAY_NAMES = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
] as const;

function shortTime(value: string): string {
  const [h, m] = value.split(':');
  if (!h) return value;
  return m && m !== '00' ? `${Number.parseInt(h, 10)} h ${m}` : `${Number.parseInt(h, 10)} h`;
}

/**
 * Jour courant dans le fuseau du site.
 * Le serveur tourne en UTC : sans cette conversion, un restaurant parisien
 * verrait « aujourd hui » basculer a 2 h du matin.
 */
function localWeekday(now: Date, timezone: string): number {
  try {
    const label = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(
      now,
    );
    const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
    return index === -1 ? now.getUTCDay() : index;
  } catch {
    return now.getUTCDay();
  }
}

function renderOpeningHours(props: Props, context: RenderContext): RawHtml {
  const hours = context.data.openingHours;
  if (hours.length === 0) return raw('');
  const today = localWeekday(context.now, context.timezone);

  const byDay = new Map<number, string[]>();
  for (const entry of hours) {
    const list = byDay.get(entry.dayOfWeek) ?? [];
    list.push(`${shortTime(entry.opensAt)} – ${shortTime(entry.closesAt)}`);
    byDay.set(entry.dayOfWeek, list);
  }

  // Semaine affichee du lundi au dimanche, convention francaise.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const closures = bool(props, 'showClosures', true)
    ? context.data.closures.filter((closure) => closure.endsOn >= isoDate(context.now))
    : [];

  return html`
    ${heading(str(props, 'title'), '')}
    <div class="hours" style="margin-top:1.75rem">
      ${join(
        order.map((day) => {
          const slots = byDay.get(day);
          return html`<div class="hours-row" data-today="${day === today ? 'true' : 'false'}">
            <span>${DAY_NAMES[day]}</span>
            <span class="${slots ? '' : 'muted'}">${slots ? slots.join(' · ') : 'Fermé'}</span>
          </div>`;
        }),
      )}
    </div>
    ${
      closures.length > 0
        ? html`<div style="margin-top:1.5rem">
            <h3 style="font-size:.9375rem">Fermetures exceptionnelles</h3>
            <ul style="margin-top:.5rem;list-style:none;padding:0" class="muted">
              ${join(
                closures.map(
                  (closure) =>
                    html`<li style="font-size:.875rem">
                      ${frenchDateRange(closure.startsOn, closure.endsOn)}${
                        closure.reason ? html` — ${closure.reason}` : ''
                      }
                    </li>`,
                ),
              )}
            </ul>
          </div>`
        : ''
    }
  `;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function frenchDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  const names = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];
  const index = Number.parseInt(month ?? '', 10) - 1;
  const name = names[index];
  if (!year || !day || !name) return iso;
  return `${Number.parseInt(day, 10)} ${name} ${year}`;
}

function frenchDateRange(from: string, to: string): string {
  return from === to ? `Le ${frenchDate(from)}` : `Du ${frenchDate(from)} au ${frenchDate(to)}`;
}

function renderTeam(props: Props, context: RenderContext): RawHtml {
  const team = context.data.team;
  if (team.length === 0) return raw('');
  const showContact = bool(props, 'showContact');
  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <div class="${team.length >= 4 ? 'g4' : 'g3'} grid" style="margin-top:2.5rem">
      ${join(
        team.map(
          (member) =>
            html`<div class="item">
              ${member.photo ? img(member.photo, 'item-media') : ''}
              <div>
                <h3>${member.fullName}</h3>
                ${member.roleLabel ? html`<p class="muted" style="font-size:.875rem">${member.roleLabel}</p>` : ''}
              </div>
              ${member.bio ? html`<p class="muted" style="font-size:.9375rem">${member.bio}</p>` : ''}
              ${
                showContact && member.email
                  ? html`<p style="font-size:.875rem">
                      <a href="mailto:${member.email}">${member.email}</a>
                    </p>`
                  : ''
              }
            </div>`,
        ),
      )}
    </div>
  `;
}

/* --- Restauration --------------------------------------------------------- */

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten',
  crustaceans: 'Crustacés',
  eggs: 'Œufs',
  fish: 'Poissons',
  peanuts: 'Arachides',
  soy: 'Soja',
  milk: 'Lait',
  nuts: 'Fruits à coque',
  celery: 'Céleri',
  mustard: 'Moutarde',
  sesame: 'Sésame',
  sulphites: 'Sulfites',
  lupin: 'Lupin',
  molluscs: 'Mollusques',
};

function menuItemRow(
  item: MenuCategoryView['items'][number],
  showAllergens: boolean,
  showImages: boolean,
): RawHtml {
  const allergens = item.allergens.map((key) => ALLERGEN_LABELS[key] ?? key).filter(Boolean);
  return html`<div class="price-row">
    ${showImages && item.image ? img(item.image, 'item-media', false) : ''}
    <div>
      <p>
        <strong>${item.name}</strong>${
          item.isSignature ? html` <span class="badge">Spécialité</span>` : ''
        }
      </p>
      ${item.description ? html`<p class="price-meta">${item.description}</p>` : ''}
      ${
        showAllergens && allergens.length > 0
          ? html`<p class="price-meta">Allergènes : ${allergens.join(', ')}</p>`
          : ''
      }
      ${
        item.dietaryTags.length > 0
          ? html`<p class="price-meta">${item.dietaryTags.join(' · ')}</p>`
          : ''
      }
    </div>
    <span class="dots" aria-hidden="true"></span>
    <span class="price-amt"
      >${item.priceCents === null ? '—' : price(item.priceCents, item.currency)}</span
    >
  </div>`;
}

function renderMenu(props: Props, context: RenderContext): RawHtml {
  const groups = arr<string>(props, 'menuGroups');
  const categories = context.data.menu.filter(
    (category) => groups.length === 0 || groups.includes(category.menuGroup),
  );
  const populated = categories.filter((category) => category.items.length > 0);
  if (populated.length === 0) return raw('');

  const showAllergens = bool(props, 'showAllergens', true);
  const showImages = bool(props, 'showImages');
  const layout = str(props, 'layout') || 'tabs';

  const body = (category: MenuCategoryView) => html`
    <h3 style="margin-bottom:.75rem">${category.name}</h3>
    ${category.description ? html`<p class="muted" style="margin-bottom:1rem">${category.description}</p>` : ''}
    <div class="price-list">
      ${join(category.items.map((item) => menuItemRow(item, showAllergens, showImages)))}
    </div>
  `;

  if (layout === 'tabs' && populated.length > 1) {
    return html`
      ${heading(str(props, 'title'), '')}
      <div style="margin-top:2rem" data-stax-tabs>
        <div class="tabs" role="tablist" aria-label="Sections de la carte">
          ${join(
            populated.map(
              (category, index) =>
                html`<button
                  type="button"
                  class="tab"
                  role="tab"
                  id="tab-${category.id}"
                  aria-controls="panel-${category.id}"
                  aria-selected="${index === 0 ? 'true' : 'false'}"
                  tabindex="${index === 0 ? '0' : '-1'}"
                >
                  ${category.name}
                </button>`,
            ),
          )}
        </div>
        ${join(
          populated.map(
            (category, index) =>
              html`<div
                class="tabpanel"
                role="tabpanel"
                id="panel-${category.id}"
                aria-labelledby="tab-${category.id}"
                ${attrs({ hidden: index !== 0, tabindex: 0 })}
              >
                ${body(category)}
              </div>`,
          ),
        )}
      </div>
      <noscript>
        <p class="muted" style="margin-top:1rem">
          Toutes les sections de la carte sont affichées ci-dessous.
        </p>
        ${join(populated.slice(1).map((category) => html`<div style="margin-top:2rem">${body(category)}</div>`))}
      </noscript>
    `;
  }

  return html`
    ${heading(str(props, 'title'), '')}
    <div class="${layout === 'columns' ? 'grid g2' : 'stack'}" style="margin-top:2rem">
      ${join(populated.map((category) => html`<div>${body(category)}</div>`))}
    </div>
  `;
}

function renderMenuPreview(props: Props, context: RenderContext): RawHtml {
  const limit = num(props, 'limit', 6);
  const onlySignature = bool(props, 'onlySignature', true);
  const items = context.data.menu
    .flatMap((category) => category.items)
    .filter((item) => (onlySignature ? item.isSignature : true))
    .slice(0, limit);
  if (items.length === 0) return raw('');
  const action = props['action'] as LinkProp | null;

  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <div class="g3 grid" style="margin-top:2.5rem">
      ${join(
        items.map(
          (item) =>
            html`<article class="card item">
              ${item.image ? img(item.image, 'item-media') : ''}
              <h3>${item.name}</h3>
              ${item.description ? html`<p>${item.description}</p>` : ''}
              ${
                item.priceCents !== null
                  ? html`<p class="item-price">${price(item.priceCents, item.currency)}</p>`
                  : ''
              }
            </article>`,
        ),
      )}
    </div>
    ${action ? html`<div class="row" style="margin-top:2rem">${button(action)}</div>` : ''}
  `;
}

/* --- Reservation ---------------------------------------------------------- */

/**
 * Formulaire de reservation.
 *
 * Aucun creneau n est calcule dans le navigateur : le visiteur choisit une
 * date, et les disponibilites reelles sont demandees au serveur, seul detenteur
 * des regles de capacite, des delais et des fermetures. Sans JavaScript, la
 * demande part quand meme et sera confirmee manuellement.
 */
function renderBooking(props: Props, context: RenderContext): RawHtml {
  const services = context.data.bookingServices;
  if (services.length === 0) return raw('');
  const selectedId = str(props, 'bookingServiceId');
  const preselected = services.find((service) => service.id === selectedId) ?? services[0];
  if (!preselected) return raw('');

  const minDate = isoDate(new Date(context.now.getTime() + preselected.leadTimeHours * 3_600_000));
  const maxDate = isoDate(new Date(context.now.getTime() + preselected.horizonDays * 86_400_000));

  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <form
      class="form wide"
      method="post"
      action="/api/bookings"
      data-stax-booking
      novalidate
      style="margin-top:2rem"
    >
      <input type="hidden" name="_token" value="${context.formToken}" />
      <div class="hp" aria-hidden="true">
        <input type="text" name="website_url" tabindex="-1" autocomplete="off" />
      </div>
      ${
        services.length > 1
          ? html`<div class="field">
              <label for="bk-service">Prestation</label>
              <select id="bk-service" name="bookingServiceId" required>
                ${join(
                  services.map(
                    (service) =>
                      html`<option
                        value="${service.id}"
                        ${attrs({ selected: service.id === preselected.id })}
                      >
                        ${service.name}${
                          service.durationMinutes
                            ? ` — ${formatDuration(service.durationMinutes)}`
                            : ''
                        }
                      </option>`,
                  ),
                )}
              </select>
            </div>`
          : html`<input type="hidden" name="bookingServiceId" value="${preselected.id}" />`
      }
      <div class="g2 grid">
        <div class="field">
          <label for="bk-date">Date</label>
          <input type="date" id="bk-date" name="date" required min="${minDate}" max="${maxDate}" />
        </div>
        <div class="field">
          <label for="bk-slot">Horaire</label>
          <select id="bk-slot" name="slot" required data-stax-slots>
            <option value="">Choisissez d’abord une date</option>
          </select>
        </div>
      </div>
      ${
        bool(props, 'showPartySize', true)
          ? html`<div class="field">
              <label for="bk-party">Nombre de personnes</label>
              <input
                type="number"
                id="bk-party"
                name="partySize"
                min="1"
                max="${preselected.capacityPerSlot}"
                value="2"
                required
              />
            </div>`
          : ''
      }
      <div class="g2 grid">
        <div class="field">
          <label for="bk-name">Nom</label>
          <input type="text" id="bk-name" name="name" required autocomplete="name" />
        </div>
        <div class="field">
          <label for="bk-phone">Téléphone</label>
          <input type="tel" id="bk-phone" name="phone" required autocomplete="tel" />
        </div>
      </div>
      <div class="field">
        <label for="bk-email">E-mail</label>
        <input type="email" id="bk-email" name="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label for="bk-note">Précision (facultatif)</label>
        <textarea id="bk-note" name="note" rows="3"></textarea>
      </div>
      ${
        context.turnstileSiteKey
          ? html`<div
              class="cf-turnstile"
              data-sitekey="${context.turnstileSiteKey}"
              data-theme="${context.theme.scheme}"
            ></div>`
          : ''
      }
      <div class="form-status" data-stax-status hidden role="status"></div>
      <div><button type="submit" class="btn btn-primary">Demander la réservation</button></div>
      <p class="form-note">
        Votre demande est transmise à l’établissement. Vous recevrez une confirmation par e-mail une
        fois celle-ci validée.
      </p>
    </form>
  `;
}

/* --- Commerce ------------------------------------------------------------- */

function renderProducts(props: Props, context: RenderContext): RawHtml {
  const limit = num(props, 'limit', 12);
  const onlyFeatured = bool(props, 'onlyFeatured');
  const categoryId = str(props, 'categoryId');
  const products = context.data.products
    .filter((product) => (onlyFeatured ? product.isFeatured : true))
    .filter(() => categoryId === '' || true)
    .slice(0, limit);
  if (products.length === 0) return raw('');

  const columns = COLUMN_CLASS[num(props, 'columns', 3)] ?? 'g3';
  const showAddToCart = bool(props, 'showAddToCart', true) && context.enabledModules.has('orders');

  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <div class="${columns} grid" style="margin-top:2.5rem">
      ${join(
        products.map(
          (product) =>
            html`<article class="card item">
              ${product.image ? img(product.image, 'item-media') : ''}
              <h3>${product.name}</h3>
              ${product.description ? html`<p>${product.description}</p>` : ''}
              <p class="item-meta">
                <span class="item-price">${price(product.priceCents, product.currency)}</span>
                ${
                  product.compareAtPriceCents !== null
                    ? html`<s class="muted"
                        >${price(product.compareAtPriceCents, product.currency)}</s
                      >`
                    : ''
                }
              </p>
              ${
                showAddToCart
                  ? product.inStock
                    ? html`<button
                        type="button"
                        class="btn btn-secondary"
                        data-stax-add-to-cart="${product.id}"
                      >
                        Ajouter au panier
                      </button>`
                    : html`<button type="button" class="btn btn-secondary" disabled>Épuisé</button>`
                  : ''
              }
            </article>`,
        ),
      )}
    </div>
  `;
}

/**
 * Panier et commande.
 *
 * Le formulaire ne porte AUCUN montant : il n envoie que les coordonnees de
 * l acheteur. Le contenu du panier vient du cookie signe, les prix de la base.
 * Un navigateur ne peut donc influencer que ce qu il commande, jamais ce qu il
 * paie.
 */
function renderCart(props: Props, context: RenderContext): RawHtml {
  if (!context.enabledModules.has('orders')) return raw('');
  return html`
    ${heading(str(props, 'title'), '')}
    <div data-stax-cart style="margin-top:2rem">
      <p class="muted" data-stax-cart-empty>Votre panier est vide pour le moment.</p>
      <div data-stax-cart-body hidden></div>

      <form data-stax-checkout class="form" style="margin-top:2.5rem" hidden novalidate>
        <h3>Vos coordonnées</h3>
        <p class="muted" style="margin-top:.25rem">
          Nous en avons besoin pour préparer votre commande et vous tenir informé.
        </p>

        <div class="field">
          <label for="stax-order-name">Nom et prénom</label>
          <input
            id="stax-order-name"
            name="name"
            type="text"
            autocomplete="name"
            maxlength="120"
            required
          />
        </div>
        <div class="field">
          <label for="stax-order-email">Adresse e-mail</label>
          <input
            id="stax-order-email"
            name="email"
            type="email"
            autocomplete="email"
            maxlength="200"
            required
          />
        </div>
        <div class="field">
          <label for="stax-order-phone">Téléphone <span class="muted">(facultatif)</span></label>
          <input id="stax-order-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" />
        </div>

        <fieldset class="field">
          <legend>Comment souhaitez-vous recevoir votre commande&nbsp;?</legend>
          <label
            ><input type="radio" name="fulfillment" value="pickup" checked /> Retrait sur
            place</label
          >
          <label
            ><input type="radio" name="fulfillment" value="shipping" /> Livraison à mon
            adresse</label
          >
        </fieldset>

        <div data-stax-checkout-address hidden>
          <div class="field">
            <label for="stax-order-address">Adresse</label>
            <input
              id="stax-order-address"
              name="addressLine1"
              type="text"
              autocomplete="address-line1"
              maxlength="120"
            />
          </div>
          <div class="field">
            <label for="stax-order-postal">Code postal</label>
            <input
              id="stax-order-postal"
              name="postalCode"
              type="text"
              autocomplete="postal-code"
              maxlength="12"
              inputmode="numeric"
            />
          </div>
          <div class="field">
            <label for="stax-order-city">Ville</label>
            <input
              id="stax-order-city"
              name="city"
              type="text"
              autocomplete="address-level2"
              maxlength="80"
            />
          </div>
        </div>

        <div class="field">
          <label for="stax-order-note">Précisions <span class="muted">(facultatif)</span></label>
          <textarea id="stax-order-note" name="note" rows="3" maxlength="1000"></textarea>
        </div>

        <input type="hidden" name="_token" value="${context.formToken}" />
        ${
          context.turnstileSiteKey
            ? html`<div class="cf-turnstile" data-sitekey="${context.turnstileSiteKey}"></div>`
            : ''
        }

        <div class="form-status" data-stax-status hidden role="status"></div>
        <button type="submit" class="btn btn-primary">Valider ma commande</button>
        <p class="muted" style="margin-top:.75rem;font-size:.8125rem">
          Le paiement se fait sur une page sécurisée. Aucune donnée bancaire ne transite par ce
          site.
        </p>
      </form>
    </div>
    <noscript>
      <p class="muted" style="margin-top:1rem">
        Le panier nécessite JavaScript. Vous pouvez nous contacter directement pour passer commande.
      </p>
    </noscript>
  `;
}

/* --- Immobilier et hebergement -------------------------------------------- */

const TRANSACTION_LABELS: Record<string, string> = {
  sale: 'Vente',
  rent: 'Location',
  seasonal: 'Saisonnier',
};

function renderProperties(props: Props, context: RenderContext): RawHtml {
  const kind = str(props, 'transactionKind') || 'all';
  const items = context.data.properties
    .filter((property) => kind === 'all' || property.transactionKind === kind)
    .slice(0, num(props, 'limit', 9));
  if (items.length === 0) return raw('');
  const columns = COLUMN_CLASS[num(props, 'columns', 3)] ?? 'g3';

  return html`
    ${heading(str(props, 'title'), '')}
    <div class="${columns} grid" style="margin-top:2.5rem">
      ${join(
        items.map(
          (property) =>
            html`<article class="card item">
              ${property.image ? img(property.image, 'item-media') : ''}
              <p class="badge">
                ${TRANSACTION_LABELS[property.transactionKind] ?? property.transactionKind}
              </p>
              <h3>${property.title}</h3>
              <p class="item-meta">
                ${property.city ? html`<span>${property.city}</span>` : ''}
                ${property.surfaceM2 ? html`<span>${property.surfaceM2} m²</span>` : ''}
                ${property.rooms ? html`<span>${property.rooms} pièces</span>` : ''}
                ${property.energyClass ? html`<span>DPE ${property.energyClass}</span>` : ''}
                ${property.ghgClass ? html`<span>GES ${property.ghgClass}</span>` : ''}
              </p>
              ${
                property.priceCents !== null
                  ? html`<p class="item-price">${price(property.priceCents, property.currency)}</p>`
                  : ''
              }
            </article>`,
        ),
      )}
    </div>
  `;
}

function renderSearchProperties(props: Props): RawHtml {
  const target = str(props, 'targetPath') || '/nos-biens';
  return html`
    ${heading(str(props, 'title'), '')}
    <form class="form wide" method="get" action="${target}" style="margin-top:2rem">
      <div class="g4 grid">
        <div class="field">
          <label for="sp-kind">Type</label>
          <select id="sp-kind" name="type">
            <option value="">Tous</option>
            <option value="apartment">Appartement</option>
            <option value="house">Maison</option>
            <option value="land">Terrain</option>
            <option value="commercial">Local commercial</option>
          </select>
        </div>
        <div class="field">
          <label for="sp-city">Ville</label>
          <input type="text" id="sp-city" name="ville" autocomplete="address-level2" />
        </div>
        <div class="field">
          <label for="sp-rooms">Pièces (min.)</label>
          <input type="number" id="sp-rooms" name="pieces" min="1" max="12" />
        </div>
        <div class="field">
          <label for="sp-budget">Budget max.</label>
          <input type="number" id="sp-budget" name="budget" min="0" step="1000" />
        </div>
      </div>
      <div><button type="submit" class="btn btn-primary">Rechercher</button></div>
    </form>
  `;
}

function renderRooms(props: Props, context: RenderContext): RawHtml {
  const rooms = context.data.rooms;
  if (rooms.length === 0) return raw('');
  const showPrices = bool(props, 'showPrices', true);
  const showBooking =
    bool(props, 'showBookingButton', true) && context.enabledModules.has('booking');

  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <div class="g3 grid" style="margin-top:2.5rem">
      ${join(
        rooms.map(
          (room) =>
            html`<article class="card item">
              ${room.image ? img(room.image, 'item-media') : ''}
              <h3>${room.name}</h3>
              ${room.description ? html`<p>${room.description}</p>` : ''}
              <p class="item-meta">
                <span>${room.capacity} personne${room.capacity > 1 ? 's' : ''}</span>
                ${room.surfaceM2 ? html`<span>${room.surfaceM2} m²</span>` : ''}
                ${room.bedConfiguration ? html`<span>${room.bedConfiguration}</span>` : ''}
              </p>
              ${
                room.amenities.length > 0
                  ? html`<div class="tags">
                      ${join(room.amenities.slice(0, 5).map((a) => html`<span class="tag">${a}</span>`))}
                    </div>`
                  : ''
              }
              ${
                showPrices && room.basePriceCents !== null
                  ? html`<p class="item-price">
                      À partir de ${price(room.basePriceCents, room.currency)} / nuit
                    </p>`
                  : ''
              }
              ${
                showBooking
                  ? html`<a class="btn btn-secondary" href="#reserver"
                      >Vérifier les disponibilités</a
                    >`
                  : ''
              }
            </article>`,
        ),
      )}
    </div>
  `;
}

/* --- Contenus edites ------------------------------------------------------ */

function entryCard(entry: ContentEntryView, showDate: boolean): RawHtml {
  return html`<article class="card item">
    ${entry.cover ? img(entry.cover, 'item-media') : ''}
    ${
      showDate && entry.publishedAt
        ? html`<p class="muted" style="font-size:.8125rem">
            <time datetime="${entry.publishedAt}"
              >${frenchDate(entry.publishedAt.slice(0, 10))}</time
            >
          </p>`
        : ''
    }
    <h3>${entry.title}</h3>
    ${entry.excerpt ? html`<p>${entry.excerpt}</p>` : ''}
  </article>`;
}

function renderPortfolio(props: Props, context: RenderContext): RawHtml {
  const items = context.data.entries
    .filter((entry) => entry.collection === 'portfolio')
    .slice(0, num(props, 'limit', 9));
  if (items.length === 0) return raw('');
  const columns = COLUMN_CLASS[num(props, 'columns', 3)] ?? 'g3';
  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <div class="${columns} grid" style="margin-top:2.5rem">
      ${join(items.map((entry) => entryCard(entry, false)))}
    </div>
  `;
}

function renderBeforeAfter(props: Props): RawHtml {
  const items = arr<{ label: string; before: MediaProp; after: MediaProp }>(props, 'items')
    .map((item) => ({ label: item.label, before: media(item.before), after: media(item.after) }))
    .filter((item) => item.before !== null && item.after !== null);
  if (items.length === 0) return raw('');

  return html`
    ${heading(str(props, 'title'), '')}
    <div class="g2 grid" style="margin-top:2.5rem">
      ${join(
        items.map(
          (item) =>
            html`<figure>
              ${item.label ? html`<figcaption class="ba-lbl">${item.label}</figcaption>` : ''}
              <div class="ba">
                <div>
                  <p class="ba-lbl">Avant</p>
                  ${img(item.before, '')}
                </div>
                <div>
                  <p class="ba-lbl">Après</p>
                  ${img(item.after, '')}
                </div>
              </div>
            </figure>`,
        ),
      )}
    </div>
  `;
}

function renderServiceArea(props: Props, context: RenderContext): RawHtml {
  const areas = context.data.serviceAreas;
  if (areas.length === 0) return raw('');
  const layout = str(props, 'layout') || 'tags';

  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    ${
      layout === 'columns'
        ? html`<ul
            class="g4 muted grid"
            style="margin-top:2rem;list-style:none;padding:0;font-size:.9375rem"
          >
            ${join(areas.map((area) => html`<li>${area.label}</li>`))}
          </ul>`
        : html`<div class="tags" style="margin-top:2rem">
            ${join(
              areas.map(
                (area) =>
                  html`<span class="tag"
                    >${area.label}${area.postalCode ? html` (${area.postalCode})` : ''}</span
                  >`,
              ),
            )}
          </div>`
    }
  `;
}

function renderEvents(props: Props, context: RenderContext): RawHtml {
  const showPast = bool(props, 'showPast');
  const today = isoDate(context.now);
  const items = context.data.entries
    .filter((entry) => entry.collection === 'event')
    .filter((entry) => {
      const date =
        typeof entry.attributes['date'] === 'string' ? (entry.attributes['date'] as string) : null;
      if (!date) return true;
      return showPast || date.slice(0, 10) >= today;
    })
    .slice(0, num(props, 'limit', 6));
  if (items.length === 0) return raw('');

  return html`
    ${heading(str(props, 'title'), '')}
    <div class="g3 grid" style="margin-top:2.5rem">
      ${join(
        items.map((entry) => {
          const date =
            typeof entry.attributes['date'] === 'string'
              ? (entry.attributes['date'] as string)
              : null;
          const place =
            typeof entry.attributes['location'] === 'string'
              ? (entry.attributes['location'] as string)
              : null;
          return html`<article class="card item">
            ${entry.cover ? img(entry.cover, 'item-media') : ''}
            ${
              date
                ? html`<p class="badge">
                    <time datetime="${date}">${frenchDate(date.slice(0, 10))}</time>
                  </p>`
                : ''
            }
            <h3>${entry.title}</h3>
            ${entry.excerpt ? html`<p>${entry.excerpt}</p>` : ''}
            ${place ? html`<p class="item-meta"><span>${place}</span></p>` : ''}
          </article>`;
        }),
      )}
    </div>
  `;
}

function renderArticles(props: Props, context: RenderContext): RawHtml {
  const items = context.data.entries
    .filter((entry) => entry.collection === 'article')
    .slice(0, num(props, 'limit', 3));
  if (items.length === 0) return raw('');
  const columns = COLUMN_CLASS[num(props, 'columns', 3)] ?? 'g3';
  return html`
    ${heading(str(props, 'title'), '')}
    <div class="${columns} grid" style="margin-top:2.5rem">
      ${join(items.map((entry) => entryCard(entry, true)))}
    </div>
  `;
}

/* --- Dons ----------------------------------------------------------------- */

function renderDonation(props: Props, context: RenderContext): RawHtml {
  if (!context.enabledModules.has('donations')) return raw('');
  const presets = arr<number>(props, 'presetAmountsCents');
  return html`
    ${heading(str(props, 'title'), str(props, 'subtitle'))}
    <form
      class="form"
      method="post"
      action="/api/donations"
      data-stax-donation
      novalidate
      style="margin-top:2rem"
    >
      <input type="hidden" name="_token" value="${context.formToken}" />
      <fieldset style="border:0;padding:0">
        <legend class="sr">Montant du don</legend>
        <div class="row">
          ${join(
            presets.map(
              (cents, index) =>
                html`<label class="tag" style="cursor:pointer">
                  <input
                    type="radio"
                    name="amountCents"
                    value="${cents}"
                    ${attrs({ checked: index === 0, required: true })}
                  />
                  ${price(cents)}
                </label>`,
            ),
          )}
        </div>
      </fieldset>
      ${
        bool(props, 'allowCustomAmount', true)
          ? html`<div class="field">
              <label for="don-custom">Autre montant (en euros)</label>
              <input type="number" id="don-custom" name="customAmount" min="1" step="1" />
            </div>`
          : ''
      }
      <div class="field">
        <label for="don-email">Votre e-mail</label>
        <input type="email" id="don-email" name="email" required autocomplete="email" />
      </div>
      <div class="form-status" data-stax-status hidden role="status"></div>
      <div><button type="submit" class="btn btn-primary">Faire un don</button></div>
      <p class="form-note">
        Le paiement est traité par notre prestataire bancaire. Aucune donnée de carte ne transite
        par ce site.
      </p>
    </form>
  `;
}

/* --- Presentation --------------------------------------------------------- */

function renderStats(props: Props): RawHtml {
  const items = arr<{ value: string; label: string; suffix: string }>(props, 'items');
  if (items.length === 0) return raw('');
  return html`<div class="stats">
    ${join(
      items.map(
        (item) =>
          html`<div>
            <p class="stat-v">${item.value}${item.suffix}</p>
            <p class="stat-l">${item.label}</p>
          </div>`,
      ),
    )}
  </div>`;
}

function renderLogos(props: Props): RawHtml {
  const items = arr<MediaProp>(props, 'items')
    .map(media)
    .filter((item): item is MediaImage => item !== null);
  if (items.length === 0) return raw('');
  return html`
    ${str(props, 'title') ? html`<p class="eyebrow ta-center">${str(props, 'title')}</p>` : ''}
    <div
      class="logos ${bool(props, 'grayscale', true) ? 'logos-gray' : ''}"
      style="margin-top:1.5rem"
    >
      ${join(items.map((item) => img(item, '')))}
    </div>
  `;
}

/**
 * Contenu integre.
 *
 * L URL est CONSTRUITE a partir d un fournisseur de la liste blanche et d un
 * identifiant valide par le schema. Aucune iframe fournie par un client n est
 * jamais rendue : ce serait autoriser l execution de code tiers sur son propre
 * domaine, et donc sur ses propres cookies.
 */
function embedUrl(provider: string, resourceId: string): string | null {
  const id = encodeURIComponent(resourceId);
  switch (provider) {
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${id}`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${id}`;
    case 'openstreetmap':
      return `https://www.openstreetmap.org/export/embed.html?bbox=${id}&layer=mapnik`;
    case 'google-maps':
      return `https://www.google.com/maps?q=${id}&output=embed`;
    case 'calendly':
      return `https://calendly.com/${resourceId.split('/').map(encodeURIComponent).join('/')}`;
    default:
      return null;
  }
}

const EMBED_TITLES: Record<string, string> = {
  youtube: 'Vidéo',
  vimeo: 'Vidéo',
  openstreetmap: 'Carte',
  'google-maps': 'Carte',
  calendly: 'Prise de rendez-vous',
};

function renderEmbed(props: Props): RawHtml {
  const provider = str(props, 'provider');
  const resourceId = str(props, 'resourceId');
  if (!resourceId) return raw('');
  const url = embedUrl(provider, resourceId);
  if (!url) return raw('');
  const ratio = (str(props, 'aspectRatio') || '16:9').replace(':', '-');

  return html`
    ${str(props, 'title') ? html`<h2>${str(props, 'title')}</h2>` : ''}
    <div class="embed ar-${ratio}" style="margin-top:1.5rem">
      <iframe
        src="${url}"
        title="${str(props, 'title') || EMBED_TITLES[provider] || 'Contenu intégré'}"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      ></iframe>
    </div>
  `;
}

/**
 * Plan d acces.
 *
 * Aucune carte tierce n est chargee par defaut : cela deposerait des traceurs
 * sans consentement. On affiche l adresse et un lien d itineraire, ce qui rend
 * exactement le service attendu sans transmettre l adresse IP du visiteur a un
 * tiers a son insu.
 */
function renderMap(props: Props, context: RenderContext): RawHtml {
  const settings = context.settings;
  const address = [
    settings.addressLine1,
    settings.addressLine2,
    [settings.postalCode, settings.city].filter(Boolean).join(' '),
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join(', ');
  if (!address) return raw('');

  const query = encodeURIComponent(`${settings.businessName}, ${address}`);
  return html`
    ${heading(str(props, 'title'), '')}
    <div style="margin-top:1.5rem">
      <p class="muted">${address}</p>
      ${
        bool(props, 'showDirectionsLink', true)
          ? html`<p class="row" style="margin-top:1rem">
              <a
                class="btn btn-secondary"
                href="https://www.openstreetmap.org/search?query=${query}"
                target="_blank"
                rel="noopener noreferrer"
                >Voir sur la carte</a
              >
              <a
                class="btn btn-link"
                href="https://www.google.com/maps/dir/?api=1&destination=${query}"
                target="_blank"
                rel="noopener noreferrer"
                >Calculer l’itinéraire</a
              >
            </p>`
          : ''
      }
    </div>
  `;
}

/* --- Repartiteur ---------------------------------------------------------- */

/** Rend un bloc. Retourne une chaine vide si le bloc n a rien a afficher. */
export function renderBlock(block: ParsedBlock, context: RenderContext): RawHtml {
  const props = block.props;
  const settings = block.settings;

  const body = ((): RawHtml => {
    switch (block.type) {
      case 'hero':
        return renderHero(props, context);
      case 'intro':
        return renderIntro(props);
      case 'section-heading':
        return heading(str(props, 'title'), str(props, 'subtitle'), str(props, 'eyebrow'));
      case 'rich-text':
        return html`<div class="prose" style="max-width:46rem">
          ${richText(arr(props, 'blocks'))}
        </div>`;
      case 'gallery':
        return renderGallery(props);
      case 'features':
        return renderFeatures(props);
      case 'trust':
        return renderTrust(props);
      case 'process':
        return renderProcess(props);
      case 'services':
        return renderServices(props, context);
      case 'pricing':
        return renderPricing(props);
      case 'testimonials':
        return renderTestimonials(props, context);
      case 'faq':
        return renderFaq(props, context);
      case 'cta':
        return renderCta(props);
      case 'contact':
        return renderContact(props, context);
      case 'quote-form':
        return renderForm(
          context,
          str(props, 'formSlug') || 'devis',
          str(props, 'title'),
          str(props, 'subtitle'),
          'quote',
        );
      case 'newsletter':
        return renderNewsletter(props, context);
      case 'map':
        return renderMap(props, context);
      case 'opening-hours':
        return renderOpeningHours(props, context);
      case 'team':
        return renderTeam(props, context);
      case 'menu':
        return renderMenu(props, context);
      case 'menu-preview':
        return renderMenuPreview(props, context);
      case 'booking':
        return renderBooking(props, context);
      case 'products':
        return renderProducts(props, context);
      case 'cart':
        return renderCart(props, context);
      case 'properties':
        return renderProperties(props, context);
      case 'search-properties':
        return renderSearchProperties(props);
      case 'rooms':
        return renderRooms(props, context);
      case 'portfolio':
        return renderPortfolio(props, context);
      case 'before-after':
        return renderBeforeAfter(props);
      case 'service-area':
        return renderServiceArea(props, context);
      case 'events':
        return renderEvents(props, context);
      case 'articles':
        return renderArticles(props, context);
      case 'donation':
        return renderDonation(props, context);
      case 'stats':
        return renderStats(props);
      case 'logos':
        return renderLogos(props);
      case 'embed':
        return renderEmbed(props);
      default:
        // Type inconnu : le snapshot l a deja ecarte, mais on ne rend rien
        // plutot que de laisser filtrer un contenu non valide.
        return raw('');
    }
  })();

  // La banniere principale porte sa propre mise en page.
  if (block.type === 'hero') return body;
  return section(settings, body);
}

/** Rend la suite de blocs d une page. */
export function renderBlocks(blocks: readonly ParsedBlock[], context: RenderContext): RawHtml {
  return join(blocks.map((block) => renderBlock(block, context)));
}

/** Expose l URL canonique d une page, utilisee par le document et le sitemap. */
export function pageUrl(context: RenderContext, path: string): string {
  return absoluteUrl(context.origin, path);
}
