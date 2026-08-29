/* eslint-disable */
const SSTConfigPage = {
    pluginUniqueId: 'b3a1c2d4-e5f6-4a89-9bcd-1234567890ab',

    loadConfiguration: function (page) {
        ApiClient.getPluginConfiguration(this.pluginUniqueId).then(function (config) {
            page.querySelector('#enableSSTUI').checked = config.EnableSSTUI;
            page.querySelector('#defaultLanguage').value = config.DefaultLanguage || '';
            page.querySelector('#enableRemoteBanner').checked = config.EnableRemoteBanner !== false;
            page.querySelector('#enableCastTargeting').checked = config.EnableCastTargeting !== false;
            page.querySelector('#enableDetailButton').checked = config.EnableDetailButton === true;
            page.querySelector('#enableAutoDownload').checked = config.EnableAutoDownload === true;
            page.querySelector('#autoDownloadLanguages').value = config.AutoDownloadLanguages || '';
            page.querySelector('#autoDownloadOnlyWhenNoSubtitles').checked = config.AutoDownloadOnlyWhenNoSubtitles !== false;
            page.querySelector('#autoDownloadTimeoutSeconds').value = config.AutoDownloadTimeoutSeconds || 30;
        });
    },

    saveConfiguration: function (page) {
        ApiClient.getPluginConfiguration(this.pluginUniqueId).then(function (config) {
            config.EnableSSTUI = page.querySelector('#enableSSTUI').checked;
            config.DefaultLanguage = page.querySelector('#defaultLanguage').value.trim();
            config.EnableRemoteBanner = page.querySelector('#enableRemoteBanner').checked;
            config.EnableCastTargeting = page.querySelector('#enableCastTargeting').checked;
            config.EnableDetailButton = page.querySelector('#enableDetailButton').checked;
            config.EnableAutoDownload = page.querySelector('#enableAutoDownload').checked;
            config.AutoDownloadLanguages = page.querySelector('#autoDownloadLanguages').value.trim();
            config.AutoDownloadOnlyWhenNoSubtitles = page.querySelector('#autoDownloadOnlyWhenNoSubtitles').checked;
            config.AutoDownloadTimeoutSeconds = parseInt(page.querySelector('#autoDownloadTimeoutSeconds').value, 10) || 30;

            ApiClient.updatePluginConfiguration(SSTConfigPage.pluginUniqueId, config).then(function () {
                Dashboard.processPluginConfigurationUpdateResult();
            });
        });
    }
};

export default function (view) {
    view.addEventListener('viewshow', function () {
        SSTConfigPage.loadConfiguration(view);
    });

    view.querySelector('#SSTConfigForm').addEventListener('submit', function (e) {
        e.preventDefault();
        SSTConfigPage.saveConfiguration(view);
        return false;
    });
}
