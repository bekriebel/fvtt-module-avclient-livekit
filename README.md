# LiveKit AVClient

A replacement for the native SimplePeer / EasyRTC A/V client in FoundryVTT. The module uses [LiveKit](https://livekit.io/) platform to provide Audio & Video communication between players.

**Note:** _At the moment there is no public LiveKit signalling server. You must configure a custom signalling server under Audio/Video communication._

I am providing access to a LiveKit server cluster that I am maintaining to anyone who subscribes to my [Patreon](https://www.patreon.com/bekit) at at least a $5 per month level. If there is interest, I will look into providing other forms of payment for this, but I will need to charge a fee to help pay for the infrastructure and my time to maintain it.

## Installation

You can install this module by using the following manifest URL: https://github.com/bekriebel/fvtt-module-avclient-livekit/releases/latest/download/module.json

## How to use

Install & enable the module then configure your LiveKit instance as the signalling server.

**Choose Signalling Server:** `Custom Server`  
**Signaling Server URL:** `rtc.example.com` \<Your LiveKit server address\>  
**Signalling Server Username:** `ABCDEFGHIJ12345` \<Your LiveKit API Key>  
**Signalling Server Password:** `****************` \<Your LiveKit Secret Key\>

## Running your own LiveKit server

_Information coming soon._

## Debugging

By default, debug logs are disabled. If additional logs are needed for troubleshooting, `Enable debug logging` can be turned on under the module settings. For even more logging of the LiveKit connection, LiveKit trace logging can be enabled after debugging logging is turned on by setting `Enable LiveKit trace logging` under module settings.

## Changelog

See [CHANGELOG](/CHANGELOG.md)

## Support my work

[![Become a Patron](https://img.shields.io/badge/support-patreon-orange.svg?logo=patreon)](https://www.patreon.com/bekit)
[![Donate via Ko-Fi](https://img.shields.io/badge/donate-ko--fi-red.svg?logo=ko-fi)](https://ko-fi.com/bekit)
