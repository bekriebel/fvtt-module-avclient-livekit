# LiveKit AVClient

A replacement for the native SimplePeer / EasyRTC A/V client in FoundryVTT. The module uses [LiveKit](https://livekit.io/) platform to provide Audio & Video communication between players.

**Note:** _At the moment there is no public LiveKit signalling server. You must configure a custom signalling server under Audio/Video communication._

I am providing access to a LiveKit server cluster that I am maintaining to anyone who subscribes to my [Patreon](https://www.patreon.com/bekit) at at least a $5 per month level. If there is interest, I will look into providing other forms of payment for this, but I will need to charge a fee to help pay for the infrastructure and my time to maintain it.

## Installation

You can install this module by using the following manifest URL: https://github.com/bekriebel/fvtt-module-avclient-livekit/releases/latest/download/module.json

## How to use

Install & enable the module then configure for your LiveKit instance under Audio/Video Configuration:

**LiveKit Server Address:** `rtc.example.com` \<Your LiveKit server address\>  
**LiveKit API Key:** `ABCDEFGHIJ12345` \<Your LiveKit API Key>  
**LiveKit Secret Key:** `****************` \<Your LiveKit Secret Key\>

### **Breakout Rooms**

A GM can now split the party!

To start a breakout room, right-click on the player you would like to break out in the player list and select `Start A/V breakout`. You will join a different A/V session with that user. You can now right-click on other users and pull them into the breakout room, or start yet another breakout room with another user.

![start breakout example](https://raw.githubusercontent.com/bekriebel/fvtt-module-avclient-livekit/main/images/example_start-breakout.png)

Though the GM will always join the breakout room on creation, they can leave the breakout room themselves by right-clicking on their own username and selecting `Leave A/V Breakout`. Users can also leave a breakout at any time by right-clicking on their own name, and the GM can end all breakout rooms by selecting `End all A/V breakouts`.

![start breakout example](https://raw.githubusercontent.com/bekriebel/fvtt-module-avclient-livekit/main/images/example_end-breakout.png)

## Running your own LiveKit server

There are several examples available for launching your own livekit server:

- [LiveKit Getting Started (Docker)](https://docs.livekit.io/guides/getting-started)
- [Deploy to a VM (AWS/Digial Ocean)](https://docs.livekit.io/deploy/vm)
- [Deploy to Kubernetes](https://docs.livekit.io/deploy/kubernetes)

Though newer versions may work, the current recommended LiveKit server version is v0.15.6. This has had the most extensive testing done with the module and matches the current client SDK version that the module is using.

> :warning: **Duck DNS and Ad blockers**: Several ad blockers seem to block websocket connections to Duck DNS URLs. If you are using Duck DNS for your LiveKit Server domain name, you and your users may need to whitelist the domain name in ad blocking extensions.

## Debugging

By default, debug logs are disabled. If additional logs are needed for troubleshooting, `Enable debug logging` can be turned on under the module settings. For even more logging of the LiveKit connection, LiveKit trace logging can be enabled after debugging logging is turned on by setting `Enable LiveKit trace logging` under module settings.

## Changelog

See [CHANGELOG](/CHANGELOG.md)

## Support my work

[![Become a Patron](https://img.shields.io/badge/support-patreon-orange.svg?logo=patreon)](https://www.patreon.com/bekit)
[![Donate via Ko-Fi](https://img.shields.io/badge/donate-ko--fi-red.svg?logo=ko-fi)](https://ko-fi.com/bekit)
