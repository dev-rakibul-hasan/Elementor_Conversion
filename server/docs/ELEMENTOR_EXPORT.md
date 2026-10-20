# Native Elementor Export

The backend compiler lives in `src/modules/elementor`. It accepts a validated
DIR document and deterministically emits Elementor page JSON built from
Flexbox Containers and classic Elementor Core widgets; it does not render a
page as HTML or CSS.

```ts
import {
  compileDIRToElementor,
  serializeElementorTemplate,
} from './modules/elementor/index.js';

const result = compileDIRToElementor(validatedDIR);
const json = serializeElementorTemplate(result.template);
// result.assetManifest contains URL, WordPress media-ID, crop, and storage mappings.
```

`serializeElementorTemplate` validates the template before producing formatted
JSON. `validateElementorTemplate` is also used by pipeline Stage 6 and checks
IDs, hierarchy, element types, native widget slugs, required widget settings,
and the prohibition on legacy Sections/Columns.

The storage adapter crops each DIR asset with a `sourceRect` to a PNG and stores
it under the project's asset path. Cropped local paths are reported in the
manifest; they are not treated as public URLs. To render imported media,
provide a public URL or a WordPress attachment ID in
`DIRAsset.metadata.wordpressAttachmentId`. Unresolved media is listed in
`assetManifest.unresolvedAssetIds`; the compiler does not fabricate media URLs.

Publishing is optional. Construct `WordPressRESTPublisher` with a WordPress
HTTPS base URL, username, application password, and optional site connection
ID, then call `publishTemplate`. It creates an Elementor Canvas page as a
draft by default. The target WordPress installation must expose writable
Elementor page metadata to the REST API; API failures are returned as errors
rather than treated as successful publishing.

DIR `form` and `input` nodes are rejected because Elementor Core does not
provide a native form/input widget. Installations that rely on Elementor Pro or
third-party widgets need target-site schema support before those nodes can be
compiled. A single Elementor page template accepts exactly one DIR page;
multi-page documents are rejected rather than silently flattening page
boundaries.
