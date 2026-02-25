# Mobile Responsive Design

**Date**: 2026-02-26
**Approach**: Responsive Sidebar Drawer

## Overview

Make the OpenClaw Manager dashboard fully mobile-responsive. Currently the app is desktop-only with a fixed 256px sidebar that breaks on mobile screens.

## Mobile Breakpoint

`< md` (768px) = mobile mode. Uses Tailwind's standard `md:` breakpoint.

## Navigation & Layout

### Mobile Header Bar (< md only)
- Height: 56px, sticky top-0, bg-surface
- Left: hamburger icon button (opens sidebar drawer)
- Center: current page title
- Right: user avatar/menu (moved from sidebar bottom)

### Sidebar Drawer (< md)
- Hidden by default on mobile
- Slide-in from left when hamburger tapped
- Dark overlay (50% opacity) behind drawer
- Close on: overlay tap, X button, or route change
- Animate with Tailwind transition (translate-x)

### Desktop (>= md)
- Sidebar fixed as before (w-64 expanded / w-16 collapsed)
- No changes to desktop behavior

### Main Content
- Desktop: `ml-64` (existing)
- Mobile: `ml-0` full viewport width + `pt-14` below header
- Padding: desktop `px-8`, mobile `px-4`

## Page Content

### Grid Cards
- Pattern: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Adjust per page based on card density

### Data Tables
- Hide non-essential columns on mobile: `hidden md:table-cell`
- Always show: name/title, status, action buttons
- Hide: secondary timestamps, IDs, metadata

### Dialogs/Modals
- Desktop: `max-w-2xl` centered (existing)
- Mobile: full-width with slight padding, bottom-aligned if appropriate
- Form inputs: larger touch targets on mobile

### Page Headers
- Desktop: title + actions on one line (`flex justify-between`)
- Mobile: stacked vertically (`flex-col sm:flex-row`)

### Stats Cards (Dashboard)
- Mobile: `grid-cols-2` (from 4)
- Slightly smaller text

## Technical Details

### No New Dependencies
- Only Tailwind responsive classes + React state

### State
- `isMobileMenuOpen` in MainLayout
- Custom `useMediaQuery` hook for `< md` detection
- Auto-close drawer on route change

### Files to Modify
1. `MainLayout.js` - mobile header + responsive margin
2. `Sidebar.js` - drawer mode + overlay + close
3. All pages in `pages/` - responsive grids, hidden columns, spacing
4. Dialog components - responsive sizing
