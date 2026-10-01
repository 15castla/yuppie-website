package com.clubyuppie.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Android has no auto-discovery for local (non-npm) plugins the way
    // iOS does (CAPBridgedPlugin conformance is enough there) — this has
    // to run before super.onCreate(), which an instance initializer block
    // guarantees. See ExternalLinkPlugin.java.
    {
        registerPlugin(ExternalLinkPlugin.class);
    }
}
