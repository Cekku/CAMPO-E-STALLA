package it.cecutti.campoestalla;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Stampa di una pagina HTML con il servizio di stampa di Android
 * (da lì si sceglie la stampante oppure "Salva come PDF").
 * La WebView dell'app non sa eseguire window.print(), per questo serve questo pezzo.
 */
@CapacitorPlugin(name = "Stampa")
public class StampaPlugin extends Plugin {

    // la pagina da stampare deve restare viva finché Android non ha preparato il documento
    private WebView pagina;

    @PluginMethod
    public void html(PluginCall call) {
        final String html = call.getString("html", "");
        final String titolo = call.getString("titolo", "Campo e Stalla");
        final boolean orizzontale = Boolean.TRUE.equals(call.getBoolean("orizzontale", false));
        getActivity().runOnUiThread(() -> {
            WebView w = new WebView(getContext());
            w.setWebViewClient(new WebViewClient() {
                private boolean fatto = false;

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (fatto) return;
                    fatto = true;
                    PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                    PrintAttributes.MediaSize a4 = orizzontale ? PrintAttributes.MediaSize.ISO_A4.asLandscape() : PrintAttributes.MediaSize.ISO_A4;
                    pm.print(titolo, view.createPrintDocumentAdapter(titolo), new PrintAttributes.Builder().setMediaSize(a4).build());
                    call.resolve();
                }
            });
            pagina = w;
            w.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        });
    }
}
