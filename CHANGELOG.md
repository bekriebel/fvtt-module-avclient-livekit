# v0.2.5

- Add a connection quality indicator using LiveKit's connection quality metrics. This can be disabled as a client module setting
- Don't stop local tracks when disconnecting from a room. This makes reconnecting and switching to a breakout room faster and a bit more stable
- Minor code cleanups
- Update dependencies, including livekit-client v0.14.3
- Updated Spanish translation and configuration strings (thanks to José E. Lozano - @lozalojo!)

# v0.2.4

- This release is mostly to test new events available with LiveKit server and client versions 0.14
- Update dependencies, including livekit-client v0.14.2
- Small updates to support new version of livekit-client, including some debug lines for new RoomEvents
- Add temporary method for printing each user's connection quality. A future release can use this data for a proper connection quality indicator in the UI

# v0.2.3

- This release focuses mostly on adding debugging functions
- Add error logging for failed track subscriptions
- Update dependencies
- Add ability to issue command for all other users to connect/disconnect/render with socket events. For example: `game.socket.emit("module.avclient-livekit", { action: "connect" });`
- General code cleanup
- Await tracks publishing during connect
- Add screen sharing option. This is an unsupported feature designed for debugging, but can be used with a script command `game.webrtc.client._liveKitClient.shareScreen(true)`

# v0.2.2

- Revert workaround for bluetooth issues and update to LiveKit client v0.13.6 for proper fix
- Add module setting to allow joining A/V using a web client in a separate browser window

# v0.2.1

- Don't stop audio tracks when muting to avoid possible issues with bluetooth devices
- Set FVTT compatibility to v0.7.2 - v9.224

# v0.2.0

- Add breakout room support. Split the party!
- Clean up disconnection steps
- Update dependencies

# v0.1.0

- Prepare for initial announced release
- Update dependencies, including livekit-client v0.13.1
- Improve error message when a client's clock is set incorrectly

# v0.0.11

- Allow simulcast to be enabled, but default to off. It now works, but savings aren't as high as originally thought. It may still be helpful to enable for low-resource clients, but it means that they may stop sending or receiving video if their CPU or connection cannot handle all of the streams.
- Set a default video encoding that saves some resources but still looks good based on configured resolution
- Allow users to disable receiving audio and or video. Not receiving video may help for users with limited CPU or bandwidth
- Minor typescript updates
- Minor English language fixes
- Minor logging fixes

# v0.0.10

- Disable simulcast again, due to a server side bug
- Minor dependency updates

# v0.0.9

- Update livekit-client dependency to v0.12.1 with fixes for the mute-loop issue

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
