using System.IO;
using System.Net.Mime;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.SST.API;

/// <summary>
/// API controller for serving SST client-side assets.
/// These endpoints serve the JavaScript and CSS files that provide
/// the in-player subtitle search UI.
/// </summary>
[ApiController]
[AllowAnonymous]
public class SSTClientScriptController : ControllerBase
{
    /// <summary>
    /// Serves the main SST JavaScript module.
    /// This endpoint is referenced by a script tag injected into the web client.
    /// </summary>
    /// <returns>The SST JavaScript file.</returns>
    [HttpGet("sst/ClientScript")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetClientScript()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = "Jellyfin.Plugin.SST.Web.sst.js";
        var stream = assembly.GetManifestResourceStream(resourceName);

        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers[HeaderNames.CacheControl] = "no-cache, no-store, must-revalidate";
        return File(stream, "application/javascript");
    }

    /// <summary>
    /// Serves the SST CSS stylesheet.
    /// </summary>
    /// <returns>The SST CSS file.</returns>
    [HttpGet("sst/ClientStyle")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetClientStyle()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = "Jellyfin.Plugin.SST.Web.sst.css";
        var stream = assembly.GetManifestResourceStream(resourceName);

        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers[HeaderNames.CacheControl] = "no-cache, no-store, must-revalidate";
        return File(stream, "text/css");
    }
}
