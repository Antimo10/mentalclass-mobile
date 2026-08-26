//  =====================================================================
//  MentalClass · Widget Android (AppWidgetProvider)
//  ---------------------------------------------------------------------
//  Widget NON interattivo: mostra la frase del giorno su sfondo brand.
//  Legge la frase dalle SharedPreferences condivise che l'app aggiorna
//  dal codice web (mc-widget.js).
//
//  NON POSSO TESTARE QUESTO CODICE dall'ambiente web: va compilato in
//  Android Studio (dentro Capawesome).
//
//  Questo file va in:
//  android/app/src/main/java/it/mentalclass/app/FraseWidget.kt
//  =====================================================================

package it.mentalclass.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class FraseWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            // Il plugin capacitor-widget-bridge scrive nelle SharedPreferences
            // con il nome del gruppo. Deve combaciare con APP_GROUP di mc-widget.js
            val prefs = context.getSharedPreferences("group.it.mentalclass.app", Context.MODE_PRIVATE)
            val frase = prefs.getString("frase_del_giorno", "Alleniamo la mente, un giorno alla volta.")
            val autore = prefs.getString("autore_del_giorno", "MentalClass")

            val views = RemoteViews(context.packageName, R.layout.frase_widget)
            views.setTextViewText(R.id.widget_frase, frase)

            // mostro l'autore solo se non è il brand generico
            if (autore != null && autore != "MentalClass" && autore.isNotEmpty()) {
                views.setTextViewText(R.id.widget_autore, "— $autore")
            } else {
                views.setTextViewText(R.id.widget_autore, "")
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
