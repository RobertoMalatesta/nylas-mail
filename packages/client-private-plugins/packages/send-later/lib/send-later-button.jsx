import React, {Component, PropTypes} from 'react'
import ReactDOM from 'react-dom'
import {Actions, DateUtils, NylasAPIHelpers, DraftHelpers} from 'nylas-exports'
import {RetinaImg} from 'nylas-component-kit'
import SendLaterPopover from './send-later-popover'
import {PLUGIN_ID, PLUGIN_NAME} from './send-later-constants'
const {NylasAPIRequest, NylasAPI} = require('nylas-exports')

const OPEN_TRACKING_ID = NylasEnv.packages.pluginIdFor('open-tracking')
const LINK_TRACKING_ID = NylasEnv.packages.pluginIdFor('link-tracking')


class SendLaterButton extends Component {
  static displayName = 'SendLaterButton';

  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
    isValidDraft: PropTypes.func,
  };

  constructor() {
    super();
    this.state = {
      saving: false,
    };
  }

  componentDidMount() {
    this.mounted = true;
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (nextState !== this.state) {
      return true;
    }
    if (this._sendLaterDateForDraft(nextProps.draft) !== this._sendLaterDateForDraft(this.props.draft)) {
      return true;
    }
    return false;
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  onSendLater = (sendLaterDate, dateLabel) => {
    if (!this.props.isValidDraft()) { return }
    Actions.closePopover();
    const sendInSec = Math.round(((new Date(sendLaterDate)).valueOf() - Date.now()) / 1000)
    Actions.recordUserEvent("Draft Sent Later", {
      timeInSec: sendInSec,
      timeInLog10Sec: Math.log10(sendInSec),
      label: dateLabel,
    });
    this.onSetMetadata(sendLaterDate);
  };

  onCancelSendLater = () => {
    Actions.closePopover();
    this.onSetMetadata(null);
  };

  onSetMetadata = async (sendLaterDate) => {
    const {draft, session} = this.props;

    this.setState({saving: true});

    try {
      await NylasAPIHelpers.authPlugin(PLUGIN_ID, PLUGIN_NAME, draft.accountId);
      if (!this.mounted) { return; }
      this.setState({saving: false});

      session.changes.add({pristine: false})
      const draftContents = await DraftHelpers.prepareDraftForSyncback(session);
      const req = new NylasAPIRequest({
        api: NylasAPI,
        options: {
          path: `/drafts/build`,
          method: 'POST',
          body: draftContents,
          accountId: draft.accountId,
          returnsModel: false,
        },
      });

      const results = await req.run();
      results.usesOpenTracking = draft.metadataForPluginId(OPEN_TRACKING_ID) != null;
      results.usesLinkTracking = draft.metadataForPluginId(LINK_TRACKING_ID) != null;
      session.changes.addPluginMetadata(PLUGIN_ID,
        Object.assign({expiration: sendLaterDate}, results));

      Actions.ensureDraftSynced(draft.clientId);

      if (sendLaterDate && NylasEnv.isComposerWindow()) {
        NylasEnv.close();
      }
    } catch (error) {
      NylasEnv.reportError(error);
      NylasEnv.showErrorDialog(`Sorry, we were unable to schedule this message. ${error.message}`);
    }
  }

  onClick = () => {
    const buttonRect = ReactDOM.findDOMNode(this).getBoundingClientRect()
    Actions.openPopover(
      <SendLaterPopover
        sendLaterDate={this._sendLaterDateForDraft(this.props.draft)}
        onSendLater={this.onSendLater}
        onCancelSendLater={this.onCancelSendLater}
      />,
      {originRect: buttonRect, direction: 'up'}
    )
  };

  _sendLaterDateForDraft(draft) {
    if (!draft) {
      return null;
    }
    const messageMetadata = draft.metadataForPluginId(PLUGIN_ID) || {};
    return messageMetadata.sendLaterDate;
  }

  render() {
    let className = 'btn btn-toolbar btn-send-later';

    if (this.state.saving) {
      return (
        <button className={className} title="Saving send date..." tabIndex={-1} style={{order: -99}}>
          <RetinaImg
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentDark}
            style={{width: 14, height: 14}}
          />
        </button>
      );
    }

    let sendLaterLabel = false;
    const sendLaterDate = this._sendLaterDateForDraft(this.props.draft);

    if (sendLaterDate) {
      className += ' btn-enabled';
      const momentDate = DateUtils.futureDateFromString(sendLaterDate);
      if (momentDate) {
        sendLaterLabel = <span className="at">Sending in {momentDate.fromNow(true)}</span>;
      } else {
        sendLaterLabel = <span className="at">Sending now</span>;
      }
    }
    return (
      <button className={className} title="Send later…" onClick={this.onClick} tabIndex={-1} style={{order: -99}}>
        <RetinaImg name="icon-composer-sendlater.png" mode={RetinaImg.Mode.ContentIsMask} />
        {sendLaterLabel}
        <span>&nbsp;</span>
        <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}

export default SendLaterButton