# v0.0.8

- Minor dependency updates

# v0.0.7

- Update dependencies
- Switch to new fix for livekit-client "mute-loop" issue

# v0.0.6

- Update dependencies
- Re-enable simulcast now that LiveKit server no longer crashes when it is used

# v0.0.5

- Update dependencies and supporting code
- Don't run setAudioEnabledState when the server isn't yet connected or the state is already set correctly
- Temporarily use a forked version of the livekit-client SDK to resolve the "mute-loop" issue
- Add an experimental web-client for testing. This is not yet available in the main module UX

# v0.0.4

- Temporarily disable simulcast as it seems to be crashing the livekit server

# v0.0.3

- Add simulcast option with default enabled
- Minor typescript code adjustments
- Minor english language fix

# v0.0.2

- Always return our own user ID as connected so our video window is shown

# v0.0.1

- Initial release
