/* eslint-disable */
const SSTConfigPage = {
    pluginUniqueId: 'b3a1c2d4-e5f6-4a89-9bcd-1234567890ab',

    loadConfiguration: function (page) {
        ApiClient.getPluginConfiguration(this.pluginUniqueId).then(function (config) {
            page.querySelector('#enableSSTUI').checked = config.EnableSSTUI;
            page.querySelector('#defaultLanguage').value = config.DefaultLanguage || '';
        });
    },

    saveConfiguration: function (page) {
        ApiClient.getPluginConfiguration(this.pluginUniqueId).then(function (config) {
            config.EnableSSTUI = page.querySelector('#enableSSTUI').checked;
            config.DefaultLanguage = page.querySelector('#defaultLanguage').value.trim();

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
