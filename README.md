# LiveKit AVClient

[![Join our Discord](https://img.shields.io/discord/909201876740890694?color=5865F2&logo=discord&logoColor=white)](https://discord.gg/Tcp9JtbpC5)
[![Become a Patron](https://img.shields.io/badge/support-patreon-orange.svg?logo=patreon)](https://tavern.at/patreon)
[![Donate via Ko-Fi](https://img.shields.io/badge/donate-ko--fi-red.svg?logo=ko-fi)](https://ko-fi.com/bekit)  
[![Latest Version](https://img.shields.io/github/v/tag/bekriebel/fvtt-module-avclient-livekit?label=version)](https://github.com/bekriebel/fvtt-module-avclient-livekit/releases)
[![Build Status](https://img.shields.io/github/workflow/status/bekriebel/fvtt-module-avclient-livekit/Release%20FoundryVTT%20Module)](https://github.com/bekriebel/fvtt-module-avclient-livekit/actions/workflows/release-fvtt-module.yml)
[![Download Count](https://img.shields.io/github/downloads/bekriebel/fvtt-module-avclient-livekit/latest/fvtt-module-avclient-livekit.zip)](https://github.com/bekriebel/fvtt-module-avclient-livekit/releases)

## About

A replacement for the native SimplePeer / EasyRTC A/V client in FoundryVTT. The module uses [LiveKit](https://livekit.io/) platform to provide Audio & Video communication between players.

> :warning: **SSL is still required**
>
> The LiveKit AVClient does not remove the need for SSL (https) on your Foundry server. Even if you use one of the hosted solutions below, all modern browsers require that the page that A/V is viewed on be secured. You can follow the following guide to set up SSL on your Foundry server: [Foundry VTT - SSL & HTTPS](https://foundryvtt.com/article/ssl/)

**Note:** _At the moment there are no free public LiveKit servers. You must configure a custom signalling server under Audio/Video communication or use one of the following options:_

[At the Tavern](https://tavern.at) is providing access to a multi-region LiveKit server cluster that we maintain to anyone who subscribes to our [Patreon](https://www.patreon.com/bekit) at at least a $5 USD per month level. The fee is used to cover the cost of the server cluster and contribute toward further development of this module.

[Forge](https://forge-vtt.com/) users can make use of the Forge's LiveKit servers with no additional configuration required.

[LiveKit Cloud](https://livekit.io/) provides a free tier, for a limited number of minutes/bandwidth per month. It may not be suitable for larger games or frequent use.

## Installation

You can install this module by using the following manifest URL: https://github.com/bekriebel/fvtt-module-avclient-livekit/releases/latest/download/module.json

## Configuration

Install & enable the module then configure for your LiveKit instance under Audio/Video Configuration:

**LiveKit Server:** Select an available option or _Custom_ for your own server  
**LiveKit Server Address:** `rtc.example.com` \<Your LiveKit server address\>  
**LiveKit API Key:** `ABCDEFGHIJ12345` \<Your LiveKit API Key>  
**LiveKit Secret Key:** `****************` \<Your LiveKit Secret Key\>

## Features

LiveKit AVClient provides a number of features beyond the A/V option built into Foundry:

- Uses a Selective Forwarding Unit (SFU) architecture instead of Mesh. This means each user only has to send their their audio and video once instead of needing to connect to every other user in the game.
- LiveKit server connections work in more network environments.
- [Breakout Rooms](#breakout-rooms) allow you to split the party!
- Adaptive Streaming and Dynamic Broadcasting reduce bandwidth and CPU usage based on video window size and available system resources.
- Opus DTX reduces bandwidth used by audio tracks when a user isn't speaking.
- A Connection Quality Indicator shows if a user's connection is having trouble.
- An optional external web client can be used to open audio and video in a separate tab, or even separate device (including mobile).
- The ability for individual users to disable receiving video in case they are on very limited connections.
- The ability to individually hide or mute users only for yourself.
- Audio Music Mode to tune audio publishing settings for audio streamed by your account.
- Actively maintained and tested against the latest versions of FoundryVTT.
- Additional features planned for future releases!

## How to use

### **Breakout Rooms**

A GM can now split the party!

To start a breakout room, right-click on the player you would like to break out in the player list and select `Start A/V breakout`. You will join a different A/V session with that user. You can now right-click on other users and pull them into the breakout room, or start yet another breakout room with another user.

![start breakout example](https://raw.githubusercontent.com/bekriebel/fvtt-module-avclient-livekit/main/images/example_start-breakout.png)

Though the GM will always join the breakout room on creation, they can leave the breakout room themselves by right-clicking on their own username and selecting `Leave A/V Breakout`. Users can also leave a breakout at any time by right-clicking on their own name, and the GM can end all breakout rooms by selecting `End all A/V breakouts`.

![start breakout example](https://raw.githubusercontent.com/bekriebel/fvtt-module-avclient-livekit/main/images/example_end-breakout.png)

## Running your own LiveKit server

There are several examples available for launching your own livekit server:

- [User created guides for FoundryVTT](https://github.com/bekriebel/fvtt-module-avclient-livekit/wiki)
- [LiveKit Getting Started](https://docs.livekit.io/guides/getting-started)
- [Deploy to a VM (GCP/AWS/Digital Ocean/Linode/Vultr/etc)](https://docs.livekit.io/deploy/vm)
- [Deploy to Kubernetes](https://docs.livekit.io/deploy/kubernetes)

Though newer versions may work, the current recommended LiveKit server version is v0.15.6. This has had the most extensive testing done with the module and matches the current client SDK version that the module is using.

> :warning: **Duck DNS and Ad blockers**: Several ad blockers seem to block websocket connections to Duck DNS URLs. If you are using Duck DNS for your LiveKit Server domain name, you and your users may need to whitelist the domain name in ad blocking extensions.

## Debugging

By default, debug logs are disabled. If additional logs are needed for troubleshooting, `Enable debug logging` can be turned on under the module settings. For even more logging of the LiveKit connection, LiveKit trace logging can be enabled after debugging logging is turned on by setting `Enable LiveKit trace logging` under module settings.

## Changelog

See [CHANGELOG](/CHANGELOG.md)
