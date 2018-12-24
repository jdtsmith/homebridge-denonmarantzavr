# homebridge-denonmarantzavr

A homebridge plugin for Denon and Marantz AVRs, to control power in main and secondary zones.

## Installation instructions

After [Homebridge](https://github.com/nfarina/homebridge) has been installed:

 ```sudo npm install -g homebridge-denonmarantzavr```

### Configuration

An example platform configuration stanza:

```json
  "platforms": [
    {
      "platform": "DenonMarantzAVR",
      "avrs": [
        {
          "name": "DenAVR",
		  "ip": "192.168.0.100",
          "model": "DenonX1400H",
		  "zones": 2
        },
	    {
          "name": "KitchenAVR",
		  "ip": "192.168.0.101",
          "model": "DenonX4400H",
        }

      ]
    }
  ]

```

where:

- `name`: The name of the AVR to control.
- `ip`: Its (fixed) IP address (try configuring in your router).
- `model`  (Optional): Model name (defaults to "DENON-LIKE AVR").
- `zones` (Optional): The number of zones to create HomeKit switches for.  Defaults to 1 (main zone only).  A maximum of 4 zones supported (depending on AVR model). 

## Contributions

I'll accept pull requests for enhancements, additional commands etc.  A very useful spreadsheet reference for the commands accepted on port 23 by recent-ish Denon/Marantz AVRs is [available here](https://docs.google.com/spreadsheets/d/1q-yIyWZQarDX_Xe3DG_ZvU_I1Lkv2WnkNw_YT14AJXE/edit?usp=sharing).  It's easy to play around with commands on your AVR like:

```
% nc 192.168.0.10 23
```

(replace with your AVR's IP address).  If you don't have `nc`, you can try `telnet`.

Some items TBD:

- Add (optional) support for multi-zone volume control (trivial command-wise, but the `Speaker` accessory is not supported in Home, so requires lightbulb or fan psuedo-accessory). 
- Add other commands, e.g. for changing inputs, surround mode, etc. 

## License

MIT License

Copyright (c) 2018 J.D. Smith

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

