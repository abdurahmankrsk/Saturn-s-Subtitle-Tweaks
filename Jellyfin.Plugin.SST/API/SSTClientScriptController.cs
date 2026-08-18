using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SST.API;

/// <summary>
/// Serves SST client-side JavaScript and CSS. These endpoints contain no secrets.
/// </summary>
[ApiController]
[Route("sst")]
[AllowAnonymous]
public class SSTClientScriptController : ControllerBase
{
    /// <summary>
    /// Serves the SST JavaScript module.
    /// </summary>
    /// <returns>The SST JavaScript file.</returns>
    [HttpGet("ClientScript")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetClientScript()
    {
        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.SST.Web.sst.js");

        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return File(stream, "application/javascript");
    }

    /// <summary>
    /// Serves the SST CSS stylesheet.
    /// </summary>
    /// <returns>The SST CSS file.</returns>
    [HttpGet("ClientStyle")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetClientStyle()
    {
        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.SST.Web.sst.css");

        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return File(stream, "text/css");
    }
}
