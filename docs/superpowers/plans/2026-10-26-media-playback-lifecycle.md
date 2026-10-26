# Workshop playback lifecycle

Continue active storefront fidelity/performance goal from merged PR46. Root reproduced actual built-browser defect: explicit Play starts workshopvideo; scrolling to testimonial leaves video completely outside viewport (top-4937,bottom-4437) but paused=false. Preserve original copy, artwork and explicit playback.

Implement browser lifecycle ownership within Hero: source loaded only after manual Play, actual media state reflected by accessible control, pause when offscreen/documenthidden/reduced-motion becomes enabled, no automatic restart on return, pending-play invalidation and cleanup. Unsupported observation capability must not prevent explicit playback. Failedplay/error/nativepause/ended and rapid interaction must not misreport playback or undo newer intent. Existing CategoryVideo supplies patterns; no broad refactor or animation dependency.

Hero agent owns hero.tsx and new hero-video-motion.test.tsx plus private RED/GREEN evidence. Root owns integration/browser/fullsuite/build/bundle/security/release. Separate read-only agent audits broader admin readiness and designs full saved-draft preview; no preview implementation is implied by this video change. Dedicated test database owned by root; no production writes or provider sends.

Validate genuine assertion RED before implementation, focused GREEN/affected renderer tests, all project tests and guarded recovery, Node22 types/build, existing homepage payload budget, dependency/staged/history/static scans, immutable independent review and exact-head CI. Built-browser check Play->offscreen->return remains paused->explicitPlay; keyboard and label reflect state. No checkout activation. Production capacity/backups remain independent release gates.
