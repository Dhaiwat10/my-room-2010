import { JOBS } from "../../../content";
import { BriefcaseIcon } from "../icons";

export function Work() {
  return (
    <div className="xp-app xp-explorer">
      <div className="xp-menubar">
        {["File", "Edit", "View", "Favorites", "Tools", "Help"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="xp-addressbar">
        <span>Address</span>
        <div className="xp-address">
          <BriefcaseIcon size={14} />
          C:\Documents and Settings\Dhaiwat\Work
        </div>
      </div>
      <div className="xp-explorer-body">
        <div className="xp-explorer-side">
          <div className="xp-explorer-side-title">Details</div>
          <p>
            <b>Work</b>
            <br />
            File Folder
          </p>
          <p>{JOBS.length} items</p>
        </div>
        <div className="sunken-panel xp-explorer-list">
          <table className="interactive">
            <thead>
              <tr>
                <th>Name</th>
                <th>Years</th>
                <th>Website</th>
              </tr>
            </thead>
            <tbody>
              {JOBS.map((job) => (
                <tr key={`${job.name}-${job.time}`}>
                  <td>
                    <span className="xp-cell-name">
                      <BriefcaseIcon size={14} /> {job.name}
                    </span>
                  </td>
                  <td>{job.time}</td>
                  <td>
                    {job.href ? (
                      <a href={job.href} target="_blank" rel="noopener noreferrer">
                        {job.href.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">{JOBS.length} objects</p>
        <p className="status-bar-field">My Computer</p>
      </div>
    </div>
  );
}
