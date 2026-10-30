package it.cecutti.campoestalla;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StampaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
