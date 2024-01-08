import { EventExt, EventKind, HexKey, NostrLink, NostrPrefix, TaggedNostrEvent } from "@snort/system";
import classNames from "classnames";
import React, { ReactNode, useState } from "react";
import { useInView } from "react-intersection-observer";
import { FormattedMessage, useIntl } from "react-intl";
import { Link, useNavigate } from "react-router-dom";

import { UserCache } from "@/Cache";
import { NoteText } from "@/Components/Event/Note/NoteText";
import Icon from "@/Components/Icons/Icon";
import DisplayName from "@/Components/User/DisplayName";
import { ProfileLink } from "@/Components/User/ProfileLink";
import useEventPublisher from "@/Hooks/useEventPublisher";
import useLogin from "@/Hooks/useLogin";
import useModeration from "@/Hooks/useModeration";
import { chainKey } from "@/Hooks/useThreadContext";
import { findTag, hexToBech32 } from "@/Utils";
import { setBookmarked, setPinned } from "@/Utils/Login";

import messages from "../../messages";
import Text from "../../Text/Text";
import ProfileImage from "../../User/ProfileImage";
import { NoteProps } from "../EventComponent";
import HiddenNote from "../HiddenNote";
import Poll from "../Poll";
import { NoteContextMenu, NoteTranslation } from "./NoteContextMenu";
import NoteFooter from "./NoteFooter";
import NoteTime from "./NoteTime";
import ReactionsModal from "./ReactionsModal";

export function NoteInner(props: NoteProps) {
  const { data: ev, highlight, options: opt, ignoreModeration = false, className, waitUntilInView } = props;

  const baseClassName = classNames("note min-h-[110px] flex flex-col gap-4 card", className);
  const navigate = useNavigate();
  const [showReactions, setShowReactions] = useState(false);

  const { isEventMuted } = useModeration();
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: "2000px" });
  const login = useLogin();
  const { pinned, bookmarked } = useLogin();
  const { publisher, system } = useEventPublisher();
  const [showTranslation, setShowTranslation] = useState(true);
  const [translated, setTranslated] = useState<NoteTranslation>();
  const { formatMessage } = useIntl();

  const options = {
    showHeader: true,
    showTime: true,
    showFooter: true,
    canUnpin: false,
    canUnbookmark: false,
    showContextMenu: true,
    ...opt,
  };

  async function unpin(id: HexKey) {
    if (options.canUnpin && publisher) {
      if (window.confirm(formatMessage(messages.ConfirmUnpin))) {
        const es = pinned.item.filter(e => e !== id);
        const ev = await publisher.pinned(es.map(a => new NostrLink(NostrPrefix.Note, a)));
        system.BroadcastEvent(ev);
        setPinned(login, es, ev.created_at * 1000);
      }
    }
  }

  async function unbookmark(id: HexKey) {
    if (options.canUnbookmark && publisher) {
      if (window.confirm(formatMessage(messages.ConfirmUnbookmark))) {
        const es = bookmarked.item.filter(e => e !== id);
        const ev = await publisher.pinned(es.map(a => new NostrLink(NostrPrefix.Note, a)));
        system.BroadcastEvent(ev);
        setBookmarked(login, es, ev.created_at * 1000);
      }
    }
  }

  function goToEvent(e: React.MouseEvent, eTarget: TaggedNostrEvent) {
    if (opt?.canClick === false) {
      return;
    }

    let target = e.target as HTMLElement | null;
    while (target) {
      if (
        target.tagName === "A" ||
        target.tagName === "BUTTON" ||
        target.classList.contains("reaction-pill") ||
        target.classList.contains("szh-menu-container")
      ) {
        return; // is there a better way to do this?
      }
      target = target.parentElement;
    }

    e.stopPropagation();
    if (props.onClick) {
      props.onClick(eTarget);
      return;
    }

    const link = NostrLink.fromEvent(eTarget);
    // detect cmd key and open in new tab
    if (e.metaKey) {
      window.open(`/${link.encode(CONFIG.eventLinkPrefix)}`, "_blank");
    } else {
      navigate(`/${link.encode(CONFIG.eventLinkPrefix)}`, {
        state: eTarget,
      });
    }
  }

  function replyTag() {
    const thread = EventExt.extractThread(ev);
    if (thread === undefined) {
      return undefined;
    }

    const maxMentions = 2;
    const replyTo = thread?.replyTo ?? thread?.root;
    const replyLink = replyTo
      ? NostrLink.fromTag(
          [replyTo.key, replyTo.value ?? "", replyTo.relay ?? "", replyTo.marker ?? ""].filter(a => a.length > 0),
        )
      : undefined;
    const mentions: { pk: string; name: string; link: ReactNode }[] = [];
    for (const pk of thread?.pubKeys ?? []) {
      const u = UserCache.getFromCache(pk);
      const npub = hexToBech32(NostrPrefix.PublicKey, pk);
      const shortNpub = npub.substring(0, 12);
      mentions.push({
        pk,
        name: u?.name ?? shortNpub,
        link: (
          <ProfileLink pubkey={pk} user={u}>
            <DisplayName pubkey={pk} user={u} />{" "}
          </ProfileLink>
        ),
      });
    }
    mentions.sort(a => (a.name.startsWith(NostrPrefix.PublicKey) ? 1 : -1));
    const othersLength = mentions.length - maxMentions;
    const renderMention = (m: { link: React.ReactNode; pk: string; name: string }, idx: number) => {
      return (
        <React.Fragment key={m.pk}>
          {idx > 0 && ", "}
          {m.link}
        </React.Fragment>
      );
    };
    const pubMentions =
      mentions.length > maxMentions ? mentions?.slice(0, maxMentions).map(renderMention) : mentions?.map(renderMention);
    const others = mentions.length > maxMentions ? formatMessage(messages.Others, { n: othersLength }) : "";
    const link = replyLink?.encode(CONFIG.eventLinkPrefix);
    return (
      <div className="reply">
        re:&nbsp;
        {(mentions?.length ?? 0) > 0 ? (
          <>
            {pubMentions} {others}
          </>
        ) : (
          replyLink && <Link to={`/${link}`}>{link?.substring(0, 12)}</Link>
        )}
      </div>
    );
  }

  const canRenderAsTextNote = [EventKind.TextNote, EventKind.Polls];
  if (!canRenderAsTextNote.includes(ev.kind)) {
    const alt = findTag(ev, "alt");
    if (alt) {
      return (
        <div className="note-quote">
          <Text id={ev.id} content={alt} tags={[]} creator={ev.pubkey} />
        </div>
      );
    } else {
      return (
        <>
          <h4>
            <FormattedMessage {...messages.UnknownEventKind} values={{ kind: ev.kind }} />
          </h4>
          <pre>{JSON.stringify(ev, undefined, "  ")}</pre>
        </>
      );
    }
  }

  function translation() {
    if (translated && translated.confidence > 0.5) {
      return (
        <>
          <span
            className="text-xs font-semibold text-gray-light select-none"
            onClick={e => {
              e.stopPropagation();
              setShowTranslation(s => !s);
            }}>
            <FormattedMessage {...messages.TranslatedFrom} values={{ lang: translated.fromLanguage }} />
          </span>
        </>
      );
    } else if (translated) {
      return (
        <p className="text-xs font-semibold text-gray-light">
          <FormattedMessage {...messages.TranslationFailed} />
        </p>
      );
    }
  }

  function pollOptions() {
    if (ev.kind !== EventKind.Polls) return;

    return <Poll ev={ev} />;
  }

  function content() {
    if (waitUntilInView && !inView) return undefined;
    return (
      <>
        {options.showHeader && (
          <div className="header flex">
            <ProfileImage
              pubkey={ev.pubkey}
              subHeader={replyTag() ?? undefined}
              link={opt?.canClick === undefined ? undefined : ""}
              showProfileCard={options.showProfileCard ?? true}
              showBadges={true}
            />
            <div className="info">
              {props.context}
              {(options.showTime || options.showBookmarked) && (
                <>
                  {options.showBookmarked && (
                    <div
                      className={`saved ${options.canUnbookmark ? "pointer" : ""}`}
                      onClick={() => unbookmark(ev.id)}>
                      <Icon name="bookmark" /> <FormattedMessage {...messages.Bookmarked} />
                    </div>
                  )}
                  {!options.showBookmarked && <NoteTime from={ev.created_at * 1000} />}
                </>
              )}
              {options.showPinned && (
                <div className={`pinned ${options.canUnpin ? "pointer" : ""}`} onClick={() => unpin(ev.id)}>
                  <Icon name="pin" /> <FormattedMessage {...messages.Pinned} />
                </div>
              )}
              {options.showContextMenu && (
                <NoteContextMenu
                  ev={ev}
                  react={async () => {}}
                  onTranslated={t => setTranslated(t)}
                  setShowReactions={setShowReactions}
                />
              )}
            </div>
          </div>
        )}
        <div className="body" onClick={e => goToEvent(e, ev, true)}>
          <NoteText {...props} translated={translated} showTranslation={showTranslation} login={login} />
          {translation()}
          {pollOptions()}
        </div>
        {options.showFooter && <NoteFooter ev={ev} replies={props.threadChains?.get(chainKey(ev))?.length} />}
        <ReactionsModal show={showReactions} setShow={setShowReactions} event={ev} />
      </>
    );
  }

  const note = (
    <div
      className={classNames(baseClassName, {
        active: highlight,
        "hover:bg-nearly-bg-color cursor-pointer": !opt?.isRoot,
      })}
      onClick={e => goToEvent(e, ev)}
      ref={ref}>
      {content()}
    </div>
  );

  return !ignoreModeration && isEventMuted(ev) ? <HiddenNote>{note}</HiddenNote> : note;
}