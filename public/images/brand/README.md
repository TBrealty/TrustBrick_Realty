# Brand assets

Place Trustbrick master brand files here (for example `logo.svg`, `logo-mark.svg`, `logo-mono.svg`).

The logo currently shown on the site is a vector redraw in `components/brand/Logo.tsx` and `app/icon.svg`.
Replace those with the master files once they are added.

## Colours and dark backgrounds

The mark's arch is the brand navy `#0b1c48` (`--navy`), the bricks are `--brick-bright` and the check is
`#2f9a56`. The logo keeps those colours on every background: it is never recoloured to white.

Navy would disappear on a dark surface, so the mark carries a soft halo behind the arch instead. It is faded
in by the `--logo-halo` custom property, which `globals.css` sets to `1` on `[data-nav="dark"]` and on any
element with the `surface-dark` class. Give that class to any new dark panel that contains the logo (the
landing bar when it carries light text, the mobile menu, the workspace sidebar and drawer, the auth panel and
the footer already have it); the mark needs no props and the halo fades with the surface.
