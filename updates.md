### 0.22.0
A few years passed since Self-hosted LiveSync was born, and our codebase had been very complicated. This could be patient now, but it should be a tremendous hurt.
Therefore at v0.22.0, for future maintainability, I refined task scheduling logic totally.

Of course, I think this would be our suffering in some cases. However, I would love to ask you for your cooperation and contribution.

Sorry for being absent so much long. And thank you for your patience!

Note: we got a very performance improvement.

#### Version history
- 0.22.0
  - Refined:
    - Task scheduling logics has been rewritten.
    - Screen updates are also now efficient.
    - Possibly many bugs and fragile behaviour has been fixed.
    - Status updates and logging have been thinned out to display.
  - Fixed:
    - Remote-chunk-fetching now works with keeping request intervals
  - New feature:
    - We can show only the icons in the editor.
    - Progress indicators have been more meaningful:
      -   📥 Unprocessed transferred items
      -   📄 Working database operation
      -   💾 Working write storage processes
      -   ⏳ Working read storage processes
      -   🛫 Pending read storage processes
      -   ⚙️ Working or pending storage processes of hidden files
      -   🧩 Waiting chunks
      -   🔌 Working Customisation items (Configuration, snippets and plug-ins)


... To continue on to `updates_old.md`.