'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Icon,
  Input,
  RadioCards,
  Select,
  StatusPill,
  Switch,
  cn,
  useToast,
} from '@stax/ui';
import { EditorGuide } from '~/components/app/editor-guide';
import {
  PAGE_SEO_FIELD,
  collectionItemPath,
  editorMessage,
  formatFieldAddress,
  isLocalized,
  newItemId,
  parseBridgeMessage,
  parseFieldAddress,
  stableStringify,
  validateContent,
  type CollectionItem,
  type ContentDocument,
  type FieldDefinition,
  type SiteManifest,
  type ValueIssue,
} from '@stax/site-contract';
import {
  contractPreviewStatusAction,
  publishContractAction,
  releaseStatusAction,
  requestContractPreviewAction,
  saveContractDraftAction,
} from './actions';
import { FieldControl, imageUrl, type FieldEnv } from './fields';
import type { ContractEditorData, ReleaseView } from './types';

/**
 * Editeur d'un site livre.
 *
 * A gauche, les zones que le contrat du site ouvre a la modification ; au
 * centre, le VRAI site (sa version en ligne, puis l'apercu construit par
 * Cloudflare a partir du brouillon) ; a droite, les champs de la zone
 * choisie. Un clic sur un element de l'apercu ouvre son champ.
 *
 * Trois gestes : « Enregistrer le brouillon », « Aperçu », « Publier ». Rien
 * n'est « publié » tant que Cloudflare n'a pas confirmé la mise en ligne.
 */

type Selection =
  | { kind: 'global'; groupId: string }
  | { kind: 'section'; pageId: string; sectionId: string }
  | { kind: 'page-seo'; pageId: string }
  | { kind: 'collection'; collectionId: string; itemId: string | null };

const TIME = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: 'Europe/Paris' });
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function firstSelection(manifest: SiteManifest): Selection {
  const page = manifest.pages[0];
  const section = page?.sections[0];
  if (page && section) return { kind: 'section', pageId: page.id, sectionId: section.id };
  const group = manifest.globals?.[0];
  if (group) return { kind: 'global', groupId: group.id };
  return { kind: 'page-seo', pageId: page?.id ?? '' };
}

const LOCALE_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
  pt: 'Português',
};

export function ContractEditor({ data }: { data: ContractEditorData }) {
  const router = useRouter();
  const toast = useToast();
  const { manifest } = data;

  const [content, setContent] = useState<ContentDocument>(data.content);
  const [revision, setRevision] = useState(data.revision);
  const [savedSnapshot, setSavedSnapshot] = useState(() => stableStringify(data.content));
  const [savedAt, setSavedAt] = useState<string | null>(data.draftUpdatedAt);
  const [locale, setLocale] = useState(manifest.site.defaultLocale);
  const [selection, setSelection] = useState<Selection>(() => firstSelection(manifest));
  const [serverIssues, setServerIssues] = useState<ValueIssue[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>(data.mediaUrls);
  const [busy, setBusy] = useState<null | 'save' | 'preview' | 'publish'>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusAddress, setFocusAddress] = useState<string | null>(null);

  // Apercu reel (build Cloudflare du brouillon).
  const [preview, setPreview] = useState(data.preview);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  // Publication en cours.
  const [release, setRelease] = useState<ReleaseView | null>(data.inFlight);
  const [publishOpen, setPublishOpen] = useState(false);

  const dirty = stableStringify(content) !== savedSnapshot;

  /* ---------------------------------------------------------------------- */
  /*  Validation (indicative ; le serveur revalide)                          */
  /* ---------------------------------------------------------------------- */

  const deferred = useDeferredValue(content);
  const draftIssues = useMemo(
    () => validateContent(manifest, deferred, { mode: 'draft' }).issues,
    [manifest, deferred],
  );
  const publishCheck = useMemo(
    () => (publishOpen ? validateContent(manifest, content, { mode: 'publish' }) : null),
    [manifest, content, publishOpen],
  );
  const issues = useMemo(() => [...serverIssues, ...draftIssues], [serverIssues, draftIssues]);
  const issueFor = useCallback(
    (path: string) =>
      issues.find((entry) => entry.path === path && entry.severity === 'error')?.message,
    [issues],
  );

  /* ---------------------------------------------------------------------- */
  /*  Apercu : iframe du vrai site + pont                                     */
  /* ---------------------------------------------------------------------- */

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Le pont est pret pour UNE adresse precise : changer de page le remet a zero.
  const [bridgeReadyFor, setBridgeReadyFor] = useState<string | null>(null);
  const [bridgeFields, setBridgeFields] = useState<string[]>([]);
  const [editing, setEditing] = useState(true);

  const previewReady = preview?.status === 'success' && Boolean(preview.url);
  const baseUrl = showDraftPreview && previewReady ? (preview?.url ?? null) : data.frameUrl;
  const siteOrigin = useMemo(() => {
    try {
      return baseUrl ? new URL(baseUrl).origin : null;
    } catch {
      return null;
    }
  }, [baseUrl]);
  const liveOrigin = useMemo(() => {
    try {
      return data.liveUrl ? new URL(data.liveUrl).origin : null;
    } catch {
      return null;
    }
  }, [data.liveUrl]);

  const selectedPath = useMemo(() => {
    if (selection.kind === 'section' || selection.kind === 'page-seo') {
      return manifest.pages.find((page) => page.id === selection.pageId)?.path ?? '/';
    }
    if (selection.kind === 'collection' && selection.itemId) {
      const collection = manifest.collections?.find((entry) => entry.id === selection.collectionId);
      const item = content.collections[selection.collectionId]?.find(
        (entry) => entry.id === selection.itemId,
      );
      if (collection && item?.slug) return collectionItemPath(collection, item.slug) ?? '/';
    }
    return null;
  }, [selection, manifest, content.collections]);

  // La page affichee suit la zone choisie ; une zone sans page propre (infos
  // generales) laisse l'apercu ou il est. Ajustement pendant le rendu, sans
  // effet : c'est le schema recommande par React.
  const [framePath, setFramePath] = useState(selectedPath ?? '/');
  const [trackedPath, setTrackedPath] = useState(selectedPath);
  if (selectedPath !== trackedPath) {
    setTrackedPath(selectedPath);
    if (selectedPath) setFramePath(selectedPath);
  }

  const frameSrc = siteOrigin ? `${siteOrigin}${framePath}` : null;
  const bridgeReady = bridgeReadyFor !== null && bridgeReadyFor === frameSrc;

  const post = useCallback(
    (message: ReturnType<typeof editorMessage>) => {
      if (!siteOrigin || !bridgeReady) return;
      iframeRef.current?.contentWindow?.postMessage(message, siteOrigin);
    },
    [siteOrigin, bridgeReady],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!siteOrigin || event.origin !== siteOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = parseBridgeMessage(event.data);
      if (!message) return;
      if (message.type === 'ready') {
        setBridgeReadyFor(frameSrc);
        setBridgeFields(message.fields);
        return;
      }
      const address = parseFieldAddress(message.address);
      if (!address) return;
      if (address.scope === 'global') setSelection({ kind: 'global', groupId: address.groupId });
      else if (address.scope === 'page')
        setSelection({ kind: 'section', pageId: address.pageId, sectionId: address.sectionId });
      else if (address.scope === 'page-seo')
        setSelection({ kind: 'page-seo', pageId: address.pageId });
      else
        setSelection({
          kind: 'collection',
          collectionId: address.collectionId,
          itemId: address.itemId,
        });
      setFocusAddress(formatFieldAddress(address));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [siteOrigin, frameSrc]);

  useEffect(() => {
    post(editorMessage('mode', { editing }));
  }, [editing, post]);

  useEffect(() => {
    if (!focusAddress) return;
    const element = document.getElementById(`champ-${focusAddress}`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element
      ?.querySelector<HTMLElement>('input, textarea, [contenteditable="true"], button')
      ?.focus();
  }, [focusAddress, selection]);

  /* ---------------------------------------------------------------------- */
  /*  Ecriture d'une valeur                                                   */
  /* ---------------------------------------------------------------------- */

  const localize = useCallback(
    (field: FieldDefinition, stored: unknown) =>
      isLocalized(field, manifest) ? (isRecord(stored) ? stored[locale] : undefined) : stored,
    [manifest, locale],
  );

  const merge = useCallback(
    (field: FieldDefinition, stored: unknown, next: unknown) =>
      isLocalized(field, manifest) ? { ...(isRecord(stored) ? stored : {}), [locale]: next } : next,
    [manifest, locale],
  );

  /** Mise a jour instantanee de l'apercu, en attendant le vrai build. */
  const patchPreview = useCallback(
    (address: string, field: FieldDefinition, value: unknown) => {
      if (field.type === 'text' && typeof value === 'string') {
        post(editorMessage('patch', { address, kind: 'text', value: { text: value } }));
      } else if (field.type === 'link' && isRecord(value)) {
        post(
          editorMessage('patch', {
            address,
            kind: 'link',
            value: { text: String(value['label'] ?? ''), href: String(value['href'] ?? '') },
          }),
        );
      } else if (field.type === 'image') {
        const src = imageUrl(value, { mediaUrls, siteOrigin } as FieldEnv);
        if (src) {
          post(
            editorMessage('patch', {
              address,
              kind: 'image',
              value: { src, alt: isRecord(value) ? String(value['alt'] ?? '') : '' },
            }),
          );
        }
      }
    },
    [post, mediaUrls, siteOrigin],
  );

  const env: FieldEnv = {
    manifest,
    mediaUrls,
    siteOrigin: liveOrigin,
    canManageMedia: data.canManageMedia,
    onMediaPicked: (id, url) =>
      setMediaUrls((current) => ({ ...current, [id.toLowerCase()]: url })),
    issueFor,
  };

  const updateGlobal = (groupId: string, field: FieldDefinition, next: unknown) => {
    setContent((current) => {
      const group = current.globals[groupId] ?? {};
      return {
        ...current,
        globals: {
          ...current.globals,
          [groupId]: { ...group, [field.id]: merge(field, group[field.id], next) },
        },
      };
    });
    patchPreview(`globals.${groupId}.${field.id}`, field, next);
  };

  const updateSection = (
    pageId: string,
    sectionId: string,
    field: FieldDefinition,
    next: unknown,
  ) => {
    setContent((current) => {
      const page = current.pages[pageId] ?? { sections: {} };
      const section = page.sections[sectionId] ?? {};
      return {
        ...current,
        pages: {
          ...current.pages,
          [pageId]: {
            ...page,
            sections: {
              ...page.sections,
              [sectionId]: { ...section, [field.id]: merge(field, section[field.id], next) },
            },
          },
        },
      };
    });
    patchPreview(`pages.${pageId}.${sectionId}.${field.id}`, field, next);
  };

  const updateSeo = (pageId: string, next: unknown) => {
    setContent((current) => {
      const page = current.pages[pageId] ?? { sections: {} };
      return {
        ...current,
        pages: {
          ...current.pages,
          [pageId]: { ...page, seo: merge(PAGE_SEO_FIELD, page.seo, next) },
        },
      };
    });
  };

  const updateItems = (
    collectionId: string,
    update: (items: CollectionItem[]) => CollectionItem[],
  ) => {
    setContent((current) => ({
      ...current,
      collections: {
        ...current.collections,
        [collectionId]: update(current.collections[collectionId] ?? []),
      },
    }));
  };

  /* ---------------------------------------------------------------------- */
  /*  Enregistrer, apercu, publier                                            */
  /* ---------------------------------------------------------------------- */

  const save = async (): Promise<number | null> => {
    setError(null);
    setServerIssues([]);
    const result = await saveContractDraftAction({ content, expectedRevision: revision });
    if (result.status === 'error') {
      setError(result.message);
      if (result.issues) setServerIssues(result.issues);
      return null;
    }
    setRevision(result.revision);
    setSavedSnapshot(stableStringify(content));
    setSavedAt(new Date().toISOString());
    if (result.dropped.length > 0) {
      toast.info(
        'Certaines valeurs ne correspondent plus au contrat du site : elles ont été retirées.',
      );
    }
    return result.revision;
  };

  const onSave = async () => {
    setBusy('save');
    const saved = await save();
    setBusy(null);
    if (saved) toast.success('Brouillon enregistré. Votre site en ligne n’a pas changé.');
  };

  const onPreview = async () => {
    setBusy('preview');
    if (dirty && !(await save())) {
      setBusy(null);
      return;
    }
    const result = await requestContractPreviewAction();
    setBusy(null);
    if (result.status === 'error') {
      setError(result.message);
      return;
    }
    setPreview({
      id: result.previewId,
      status: 'queued',
      url: null,
      revision,
      error: null,
      createdAt: new Date().toISOString(),
    });
    setShowDraftPreview(true);
  };

  // Suivi de l'apercu jusqu'a sa construction reelle.
  useEffect(() => {
    if (!preview || !['queued', 'building', 'deploying'].includes(preview.status)) return;
    const timer = window.setTimeout(async () => {
      const result = await contractPreviewStatusAction({ previewId: preview.id });
      if (result.status === 'success') {
        setPreview((current) => (current ? { ...current, ...result.preview } : current));
      }
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [preview]);

  // Suivi d'une publication jusqu'a la confirmation de Cloudflare.
  useEffect(() => {
    if (!release || !['queued', 'committing', 'deploying'].includes(release.status)) return;
    const timer = window.setTimeout(async () => {
      const result = await releaseStatusAction({ releaseId: release.id });
      if (result.status === 'success') {
        setRelease(result.release);
        if (result.release.status === 'published') {
          toast.success(`Version ${result.release.version} en ligne.`);
          router.refresh();
        } else if (result.release.status === 'failed') {
          router.refresh();
        }
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [release, router, toast]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /* ---------------------------------------------------------------------- */
  /*  Rendu                                                                   */
  /* ---------------------------------------------------------------------- */

  const locales = manifest.site.locales;
  const inFlight = release && ['queued', 'committing', 'deploying'].includes(release.status);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col" data-testid="contract-editor">
      {/* Barre d'actions */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)]/85 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{data.siteName}</p>
          <p className="text-xs text-[var(--muted)]" aria-live="polite">
            {dirty
              ? 'Modifications non enregistrées'
              : savedAt
                ? `Brouillon enregistré à ${TIME.format(new Date(savedAt))}`
                : 'Brouillon à jour'}
            {data.production ? ` · En ligne : version ${data.production.version}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {locales.length > 1 ? (
            <Select
              aria-label="Langue modifiée"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
            >
              {locales.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_LABELS[code.slice(0, 2)] ?? code}
                  {code === manifest.site.defaultLocale ? ' (principale)' : ''}
                </option>
              ))}
            </Select>
          ) : null}
          <Button
            variant="secondary"
            loading={busy === 'save'}
            disabled={!dirty || busy !== null}
            onClick={onSave}
          >
            Enregistrer le brouillon
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'preview'}
            disabled={busy !== null}
            onClick={onPreview}
          >
            <Icon name="eye" size={16} aria-hidden="true" />
            Aperçu
          </Button>
          {data.canPublish ? (
            <Button
              variant="accent"
              disabled={busy !== null || Boolean(inFlight)}
              onClick={() => setPublishOpen(true)}
            >
              Publier
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert tone="danger" live="alert" className="mx-4 mt-3">
          {error}
        </Alert>
      ) : null}
      {release ? <ReleaseBanner release={release} /> : null}
      <EditorGuide />

      <div className="grid flex-1 gap-0 lg:grid-cols-[16rem_1fr_24rem]">
        {/* Zones modifiables */}
        <nav aria-label="Zones modifiables" className="border-r border-[var(--border)] p-3 text-sm">
          {manifest.globals?.length ? (
            <TreeGroup title="Informations générales">
              {manifest.globals.map((group) => (
                <TreeItem
                  key={group.id}
                  label={group.label}
                  active={selection.kind === 'global' && selection.groupId === group.id}
                  onClick={() => setSelection({ kind: 'global', groupId: group.id })}
                />
              ))}
            </TreeGroup>
          ) : null}
          <TreeGroup title="Pages">
            {manifest.pages.map((page) => (
              <div key={page.id} className="mb-1">
                <p className="px-2 pt-2 text-xs font-medium text-[var(--foreground-muted)]">
                  {page.label}
                </p>
                {page.sections.map((section) => (
                  <TreeItem
                    key={section.id}
                    label={section.label}
                    indent
                    marked={bridgeFields.some((address) =>
                      address.startsWith(`pages.${page.id}.${section.id}.`),
                    )}
                    active={
                      selection.kind === 'section' &&
                      selection.pageId === page.id &&
                      selection.sectionId === section.id
                    }
                    onClick={() =>
                      setSelection({ kind: 'section', pageId: page.id, sectionId: section.id })
                    }
                  />
                ))}
                {page.seo ? (
                  <TreeItem
                    label="Référencement"
                    indent
                    active={selection.kind === 'page-seo' && selection.pageId === page.id}
                    onClick={() => setSelection({ kind: 'page-seo', pageId: page.id })}
                  />
                ) : null}
              </div>
            ))}
          </TreeGroup>
          {manifest.collections?.length ? (
            <TreeGroup title="Contenus en liste">
              {manifest.collections.map((collection) => (
                <TreeItem
                  key={collection.id}
                  label={`${collection.label} (${content.collections[collection.id]?.length ?? 0})`}
                  active={
                    selection.kind === 'collection' && selection.collectionId === collection.id
                  }
                  onClick={() =>
                    setSelection({ kind: 'collection', collectionId: collection.id, itemId: null })
                  }
                />
              ))}
            </TreeGroup>
          ) : null}
          <p className="mt-6 px-2 text-2xs leading-relaxed text-[var(--muted)]">
            Vous modifiez les contenus prévus pour votre site. Pour une nouvelle page, une nouvelle
            section ou un changement de design, écrivez-nous : nous le développons pour vous.
          </p>
        </nav>

        {/* Apercu du vrai site */}
        <section
          aria-label="Aperçu du site"
          className="flex min-h-[28rem] flex-col bg-[var(--surface-2)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-xs">
            <span className="flex items-center gap-2">
              {showDraftPreview && previewReady ? (
                <StatusPill tone="accent">Aperçu du brouillon</StatusPill>
              ) : (
                <StatusPill tone="success">Site en ligne</StatusPill>
              )}
              {preview && ['queued', 'building', 'deploying'].includes(preview.status) ? (
                <span className="text-[var(--muted)]">Construction de l’aperçu en cours…</span>
              ) : null}
              {preview?.status === 'failure' ? (
                <span className="text-[var(--danger)]">L’aperçu n’a pas pu être construit.</span>
              ) : null}
            </span>
            <span className="flex items-center gap-3">
              {previewReady ? (
                <Switch
                  label="Voir le brouillon"
                  checked={showDraftPreview}
                  onChange={(event) => setShowDraftPreview(event.target.checked)}
                />
              ) : null}
              <Switch
                label="Cliquer pour modifier"
                checked={editing}
                onChange={(event) => setEditing(event.target.checked)}
              />
            </span>
          </div>
          {frameSrc ? (
            <iframe
              ref={iframeRef}
              key={frameSrc}
              src={frameSrc}
              title="Aperçu de votre site"
              className="h-full min-h-[28rem] w-full flex-1 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <p className="p-6 text-sm text-[var(--muted)]">
              {data.liveUrl ? (
                <>
                  L’aperçu intégré n’est pas disponible pour ce site. Vos modifications restent
                  enregistrées ici ;{' '}
                  <a
                    href={data.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    ouvrez votre site dans un nouvel onglet
                  </a>{' '}
                  pour le voir en ligne.
                </>
              ) : (
                'L’adresse de votre site n’est pas encore disponible.'
              )}
            </p>
          )}
          {frameSrc && !bridgeReady ? (
            <p className="border-t border-[var(--border)] px-3 py-2 text-2xs text-[var(--muted)]">
              Astuce : si un clic sur un élément n’ouvre pas son champ, choisissez la zone dans la
              liste à gauche.
            </p>
          ) : null}
        </section>

        {/* Champs */}
        <aside aria-label="Champs" className="border-l border-[var(--border)] p-4">
          <SelectionPanel
            manifest={manifest}
            content={content}
            selection={selection}
            setSelection={setSelection}
            env={env}
            locale={locale}
            localize={localize}
            onGlobal={updateGlobal}
            onSection={updateSection}
            onSeo={updateSeo}
            onItems={updateItems}
          />
        </aside>
      </div>

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        nextVersion={(data.production?.version ?? 0) + 1}
        blocking={publishCheck?.errors ?? []}
        warnings={publishCheck?.warnings ?? []}
        canSchedule={data.canSchedule}
        busy={busy === 'publish'}
        onGoTo={(path) => {
          setPublishOpen(false);
          const address = parseFieldAddress(path);
          if (!address) return;
          if (address.scope === 'global')
            setSelection({ kind: 'global', groupId: address.groupId });
          else if (address.scope === 'page')
            setSelection({ kind: 'section', pageId: address.pageId, sectionId: address.sectionId });
          else if (address.scope === 'page-seo')
            setSelection({ kind: 'page-seo', pageId: address.pageId });
          else
            setSelection({
              kind: 'collection',
              collectionId: address.collectionId,
              itemId: address.itemId,
            });
          setFocusAddress(formatFieldAddress(address));
        }}
        onConfirm={async ({ note, scheduledFor }) => {
          setBusy('publish');
          let current = revision;
          if (dirty) {
            const saved = await save();
            if (!saved) {
              setBusy(null);
              return;
            }
            current = saved;
          }
          const result = await publishContractAction({
            expectedRevision: current,
            ...(note ? { note } : {}),
            ...(scheduledFor ? { scheduledFor } : {}),
          });
          setBusy(null);
          if (result.status === 'error') {
            setError(result.message);
            if (result.issues) setServerIssues(result.issues);
            return;
          }
          setPublishOpen(false);
          toast.success(result.message ?? 'Publication lancée.');
          if (!result.scheduled) {
            setRelease({
              id: result.releaseId,
              version: result.version,
              kind: 'publish',
              status: 'queued',
              createdAt: new Date().toISOString(),
              publishedAt: null,
              scheduledFor: null,
              author: null,
              note: note ?? null,
              commit: null,
              commitUrl: null,
              deploymentStatus: null,
              deploymentUrl: null,
              error: null,
              sourceVersion: null,
            });
          }
          router.refresh();
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Arborescence                                                               */
/* -------------------------------------------------------------------------- */

function TreeGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="px-2 pb-1 text-2xs font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function TreeItem({
  label,
  active,
  onClick,
  indent,
  marked,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  indent?: boolean;
  marked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-[var(--surface-hover)]',
        indent && 'pl-4',
        active && 'bg-[var(--surface-elevated)] font-medium text-[var(--foreground)]',
      )}
    >
      <span className="truncate">{label}</span>
      {marked ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--accent)]" />
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Panneau des champs                                                         */
/* -------------------------------------------------------------------------- */

function FieldBlock({
  address,
  field,
  stored,
  onChange,
  env,
  locale,
  localize,
  manifest,
}: {
  address: string;
  field: FieldDefinition;
  stored: unknown;
  onChange: (next: unknown) => void;
  env: FieldEnv;
  locale: string;
  localize: (field: FieldDefinition, stored: unknown) => unknown;
  manifest: SiteManifest;
}) {
  const localized = isLocalized(field, manifest);
  const path = localized ? `${address}@${locale}` : address;
  return (
    <div id={`champ-${address}`} className="scroll-mt-24">
      <FieldControl
        field={field}
        value={localize(field, stored)}
        onChange={onChange}
        env={env}
        path={path}
      />
      {field.help && field.type !== 'text' && field.type !== 'image' ? (
        <p className="mt-1 text-2xs text-[var(--muted)]">{field.help}</p>
      ) : null}
    </div>
  );
}

function SelectionPanel({
  manifest,
  content,
  selection,
  setSelection,
  env,
  locale,
  localize,
  onGlobal,
  onSection,
  onSeo,
  onItems,
}: {
  manifest: SiteManifest;
  content: ContentDocument;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  env: FieldEnv;
  locale: string;
  localize: (field: FieldDefinition, stored: unknown) => unknown;
  onGlobal: (groupId: string, field: FieldDefinition, next: unknown) => void;
  onSection: (pageId: string, sectionId: string, field: FieldDefinition, next: unknown) => void;
  onSeo: (pageId: string, next: unknown) => void;
  onItems: (collectionId: string, update: (items: CollectionItem[]) => CollectionItem[]) => void;
}) {
  if (selection.kind === 'global') {
    const group = manifest.globals?.find((entry) => entry.id === selection.groupId);
    if (!group) return null;
    const values = content.globals[group.id] ?? {};
    return (
      <PanelShell title={group.label} help={group.help}>
        {group.fields.map((field) => (
          <FieldBlock
            key={field.id}
            address={`globals.${group.id}.${field.id}`}
            field={field}
            stored={values[field.id]}
            onChange={(next) => onGlobal(group.id, field, next)}
            env={env}
            locale={locale}
            localize={localize}
            manifest={manifest}
          />
        ))}
      </PanelShell>
    );
  }

  if (selection.kind === 'section') {
    const page = manifest.pages.find((entry) => entry.id === selection.pageId);
    const section = page?.sections.find((entry) => entry.id === selection.sectionId);
    if (!page || !section) return null;
    const values = content.pages[page.id]?.sections[section.id] ?? {};
    return (
      <PanelShell title={section.label} subtitle={page.label} help={section.help}>
        {section.fields.map((field) => (
          <FieldBlock
            key={field.id}
            address={`pages.${page.id}.${section.id}.${field.id}`}
            field={field}
            stored={values[field.id]}
            onChange={(next) => onSection(page.id, section.id, field, next)}
            env={env}
            locale={locale}
            localize={localize}
            manifest={manifest}
          />
        ))}
      </PanelShell>
    );
  }

  if (selection.kind === 'page-seo') {
    const page = manifest.pages.find((entry) => entry.id === selection.pageId);
    if (!page) return null;
    return (
      <PanelShell title="Référencement" subtitle={page.label}>
        <FieldBlock
          address={`pages.${page.id}._seo`}
          field={PAGE_SEO_FIELD}
          stored={content.pages[page.id]?.seo}
          onChange={(next) => onSeo(page.id, next)}
          env={env}
          locale={locale}
          localize={localize}
          manifest={manifest}
        />
      </PanelShell>
    );
  }

  const collection = manifest.collections?.find((entry) => entry.id === selection.collectionId);
  if (!collection) return null;
  const items = content.collections[collection.id] ?? [];
  const item = selection.itemId ? items.find((entry) => entry.id === selection.itemId) : null;

  if (!item) {
    const titleField = collection.fields.find((field) => field.type === 'text');
    const titleOf = (entry: CollectionItem) => {
      const stored = titleField ? entry.values[titleField.id] : undefined;
      const value = titleField ? localize(titleField, stored) : undefined;
      return typeof value === 'string' && value ? value : `${collection.itemLabel} sans titre`;
    };
    const move = (index: number, delta: number) =>
      onItems(collection.id, (list) => {
        const next = [...list];
        const [moved] = next.splice(index, 1);
        if (moved) next.splice(index + delta, 0, moved);
        return next;
      });
    return (
      <PanelShell title={collection.label} help={collection.help}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            const created: CollectionItem = { id: newItemId(), values: {}, hidden: true };
            onItems(collection.id, (list) => [created, ...list]);
            setSelection({ kind: 'collection', collectionId: collection.id, itemId: created.id });
          }}
        >
          Ajouter : {collection.itemLabel.toLowerCase()}
        </Button>
        {items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Aucun élément pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {items.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() =>
                    setSelection({
                      kind: 'collection',
                      collectionId: collection.id,
                      itemId: entry.id,
                    })
                  }
                >
                  {titleOf(entry)}
                </button>
                {entry.hidden ? <Badge>Masqué</Badge> : null}
                <span className="flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Monter"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Descendre"
                  >
                    ↓
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>
    );
  }

  return (
    <PanelShell title={collection.itemLabel} subtitle={collection.label}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          setSelection({ kind: 'collection', collectionId: collection.id, itemId: null })
        }
      >
        ← Tous les éléments
      </Button>
      <Switch
        label={item.hidden ? 'Masqué du site' : 'Visible sur le site'}
        checked={!item.hidden}
        onChange={(event) =>
          onItems(collection.id, (list) =>
            list.map((entry) =>
              entry.id === item.id ? { ...entry, hidden: !event.target.checked } : entry,
            ),
          )
        }
      />
      {collection.fields.map((field) => (
        <FieldBlock
          key={field.id}
          address={`collections.${collection.id}.${item.id}.${field.id}`}
          field={field}
          stored={item.values[field.id]}
          onChange={(next) =>
            onItems(collection.id, (list) =>
              list.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      values: {
                        ...entry.values,
                        [field.id]: isLocalized(field, manifest)
                          ? {
                              ...(isRecord(entry.values[field.id])
                                ? (entry.values[field.id] as Record<string, unknown>)
                                : {}),
                              [locale]: next,
                            }
                          : next,
                      },
                    }
                  : entry,
              ),
            )
          }
          env={env}
          locale={locale}
          localize={localize}
          manifest={manifest}
        />
      ))}
      {collection.route ? (
        <Field label="Adresse de la page" hint="Calculée depuis le titre si vous la laissez vide.">
          <Input
            value={item.slug ?? ''}
            placeholder="mon-article"
            onChange={(event) =>
              onItems(collection.id, (list) =>
                list.map((entry) =>
                  entry.id === item.id ? { ...entry, slug: event.target.value } : entry,
                ),
              )
            }
          />
        </Field>
      ) : null}
      <div className="border-t border-[var(--border)] pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (
              !window.confirm(
                'Supprimer cet élément ? Il disparaîtra du site à la prochaine publication.',
              )
            )
              return;
            onItems(collection.id, (list) => list.filter((entry) => entry.id !== item.id));
            setSelection({ kind: 'collection', collectionId: collection.id, itemId: null });
          }}
        >
          Supprimer
        </Button>
      </div>
    </PanelShell>
  );
}

function PanelShell({
  title,
  subtitle,
  help,
  children,
}: {
  title: string;
  subtitle?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        {subtitle ? (
          <p className="text-2xs font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
            {subtitle}
          </p>
        ) : null}
        <h2 className="text-base font-medium">{title}</h2>
        {help ? <p className="mt-1 text-xs text-[var(--foreground-muted)]">{help}</p> : null}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Publication                                                                */
/* -------------------------------------------------------------------------- */

const RELEASE_STEPS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'write', label: 'Enregistrement de la version', statuses: ['queued', 'committing'] },
  { key: 'deploy', label: 'Mise à jour de votre site', statuses: ['deploying'] },
  { key: 'live', label: 'En ligne', statuses: ['published'] },
];

function ReleaseBanner({ release }: { release: ReleaseView }) {
  if (release.status === 'failed') {
    return (
      <Alert
        tone="danger"
        live="alert"
        className="mx-4 mt-3"
        title={`La version ${release.version} n’a pas été publiée`}
      >
        Votre site en ligne n’a pas changé : la version précédente reste affichée.
        {release.error ? ` ${release.error}` : ''} Vous pouvez republier dès que possible ; l’équipe
        StaX est prévenue.
      </Alert>
    );
  }
  if (release.status === 'published') {
    return (
      <Alert
        tone="success"
        live="status"
        className="mx-4 mt-3"
        title={`Version ${release.version} en ligne`}
      >
        Cloudflare a confirmé la mise en ligne
        {release.publishedAt ? ` le ${DATE_TIME.format(new Date(release.publishedAt))}` : ''}.
      </Alert>
    );
  }
  if (!['queued', 'committing', 'deploying'].includes(release.status)) return null;
  const current = RELEASE_STEPS.findIndex((step) => step.statuses.includes(release.status));
  return (
    <div
      className="mx-4 mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium">Publication de la version {release.version}…</p>
      <ol className="mt-2 flex flex-wrap gap-4 text-xs">
        {RELEASE_STEPS.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              'flex items-center gap-1.5',
              index < current && 'text-[var(--success)]',
              index === current && 'font-medium text-[var(--foreground)]',
              index > current && 'text-[var(--muted)]',
            )}
          >
            <span aria-hidden="true">{index < current ? '✓' : index === current ? '●' : '○'}</span>
            {step.label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-2xs text-[var(--muted)]">
        Votre site actuel reste en ligne pendant la mise à jour. « En ligne » ne s’affiche qu’une
        fois la nouvelle version réellement déployée.
      </p>
    </div>
  );
}

function PublishDialog({
  open,
  onClose,
  nextVersion,
  blocking,
  warnings,
  canSchedule,
  busy,
  onConfirm,
  onGoTo,
}: {
  open: boolean;
  onClose: () => void;
  nextVersion: number;
  blocking: ValueIssue[];
  warnings: ValueIssue[];
  canSchedule: boolean;
  busy: boolean;
  onConfirm: (input: { note: string | null; scheduledFor: string | null }) => Promise<void>;
  onGoTo: (path: string) => void;
}) {
  const [note, setNote] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [date, setDate] = useState('');
  const scheduledFor = when === 'later' && date ? new Date(date).toISOString() : null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Publier la version ${nextVersion}`}
      description="Votre site en ligne est mis à jour avec ce brouillon. La mise en ligne prend en général quelques minutes."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={blocking.length > 0 || (when === 'later' && !date)}
            onClick={() => void onConfirm({ note: note.trim() || null, scheduledFor })}
          >
            {when === 'later' ? 'Programmer' : 'Publier'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {blocking.length > 0 ? (
          <Alert tone="warning" title="À compléter avant de publier">
            <ul className="mt-1 space-y-1">
              {blocking.slice(0, 8).map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <button
                    type="button"
                    className="text-left underline underline-offset-2"
                    onClick={() => onGoTo(issue.path.split('@')[0] ?? issue.path)}
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {warnings.length > 0 && blocking.length === 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--foreground-muted)]">
            {warnings.slice(0, 5).map((issue) => (
              <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        ) : null}
        <Field
          label="Qu’avez-vous changé ? (facultatif)"
          hint="Visible dans l’historique des versions."
        >
          <Input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {canSchedule ? (
          <>
            <RadioCards
              name="publish-when"
              value={when}
              onChange={(value) => setWhen(value as 'now' | 'later')}
              options={[
                {
                  value: 'now',
                  label: 'Maintenant',
                  description: 'La mise à jour démarre tout de suite.',
                },
                {
                  value: 'later',
                  label: 'Programmer',
                  description: 'À la date et l’heure choisies.',
                },
              ]}
            />
            {when === 'later' ? (
              <Field label="Date et heure de publication">
                <Input
                  type="datetime-local"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </Field>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
