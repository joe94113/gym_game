"""Import selected actual Vicon optical episodes, never the Kinect FK files.

RSHO/RELB/wrist markers define segment directions, not clinical joint centres.
The actual recordings are right-sided unweighted rehabilitation movements.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / '.local-tools' / 'ui-prmd-v018'
RESEARCH = ROOT / 'artifacts' / 'mocap-v018' / 'research'
TRIALS = [('m07', 'e02'), ('m07', 'e03'), ('m08', 'e01'), ('m08', 'e02'), ('m10', 'e02'), ('m10', 'e03')]
EXPECTED_FRAMES = {('m07', 'e02'): 283, ('m07', 'e03'): 292, ('m08', 'e01'): 160,
                   ('m08', 'e02'): 200, ('m10', 'e02'): 181, ('m10', 'e03'): 176}
TASK_NAMES = {'m07': 'Standing shoulder abduction', 'm08': 'Standing shoulder extension', 'm10': 'Standing shoulder scaption'}
CHANNELS = []
for stem in ['rightUpper', 'rightLower', 'rightHand', 'torso', 'head', 'pelvisRelativeAnkles', 'shoulderRelativePelvis']:
    CHANNELS.extend(stem + axis for axis in 'XYZ')
CHANNELS += ['elbowMarkerAngleDeg', 'armElevationMarkerDeg']
STEPS = np.array([.0001] * 21 + [.01] * 2)
ZIP_URL = 'https://zenodo.org/api/records/23104965/files/Segmented%20Movements.zip/content'
ATTRIBUTION = ('University of Idaho Physical Rehabilitation Movements Data Set (UI-PRMD). '
               'A. Vakanski, D. Paul, R. Baker, and H.-p. Jun. '
               'https://www.idahofallshighered.org/vakanski/ui-prmd.html; '
               'https://zenodo.org/records/23104965. Data released under Open Data Commons '
               'Public Domain Dedication and License v1.0, https://opendatacommons.org/licenses/pddl/1-0/. '
               'Changes: selected six complete right-arm Vicon episodes; five-frame marker smoothing; '
               'marker-based anatomical coordinate frame, segment directions and length-proxy normalization; '
               '121-point time resampling and quantization. Mirroring the right arm for a game left arm is a '
               'derived adaptation, not a recorded bilateral or weighted exercise. No source finger motion or '
               'clinical joint centre, therapist approval, or Kinect forward kinematics is inferred.')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unit(value):
    lengths = np.linalg.norm(value, axis=-1, keepdims=True)
    if not np.isfinite(lengths).all() or lengths.min() < 1e-8:
        raise ValueError('Invalid optical segment direction')
    return value / lengths


def smooth(values):
    pad = np.pad(values, [(2, 2)] + [(0, 0)] * (values.ndim - 1), mode='edge')
    return sum(pad[i:i + len(values)] for i in range(5)) / 5


def load_trial(task, repetition, marker_names):
    positions_path = INPUT / f'{task}_s01_{repetition}_positions.txt'
    angles_path = INPUT / f'{task}_s01_{repetition}_angles.txt'
    positions = np.loadtxt(positions_path, delimiter=',')
    angles = np.loadtxt(angles_path, delimiter=',')
    if positions.ndim != 2 or positions.shape[1] != 117 or positions.shape != angles.shape:
        raise ValueError('Expected matching 39x3 Vicon columns; Kinect 22-point data is rejected')
    if len(positions) != EXPECTED_FRAMES[(task, repetition)] or not np.isfinite(positions).all() or not np.isfinite(angles).all():
        raise ValueError('Incomplete or nonfinite original optical episode')
    if len(marker_names) != 39 or len(set(marker_names)) != 39:
        raise ValueError('Expected documented 39-marker position order')
    return positions.reshape(-1, 39, 3) * .001, positions_path, angles_path


def anatomical_frame(points, indices):
    rest = points[:10].mean(axis=0)
    at = lambda name: rest[indices[name]]
    pelvis = np.mean([at(name) for name in ['LASI', 'RASI', 'LPSI', 'RPSI']], axis=0)
    shoulder = (at('LSHO') + at('RSHO')) / 2
    up = unit(shoulder - pelvis)
    right = at('RASI') - at('LASI')
    right = unit(right - right.dot(up) * up)
    forward = (at('LTOE') - at('LHEE') + at('RTOE') - at('RHEE')) / 2
    forward = unit(forward - forward.dot(up) * up - forward.dot(right) * right)
    basis = np.stack([right, up, forward], axis=1)
    proxy = np.mean([np.linalg.norm(at('LASI') - at('LKNE')) + np.linalg.norm(at('LKNE') - at('LANK')),
                     np.linalg.norm(at('RASI') - at('RKNE')) + np.linalg.norm(at('RKNE') - at('RANK'))])
    if proxy <= 0 or np.max(np.abs(basis.T @ basis - np.eye(3))) > 1e-8:
        raise ValueError('Invalid anatomical frame')
    return basis, float(proxy)


def channels(points, indices):
    basis, proxy = anatomical_frame(points, indices)
    p = smooth(points) @ basis
    at = lambda name: p[:, indices[name]]
    pelvis = np.mean([at(name) for name in ['LASI', 'RASI', 'LPSI', 'RPSI']], axis=0)
    shoulder = (at('LSHO') + at('RSHO')) / 2
    ankles = (at('LANK') + at('RANK')) / 2
    wrist = (at('RWRA') + at('RWRB')) / 2
    neck_proxy = (at('C7') + at('CLAV')) / 2
    head = np.mean([at(name) for name in ['LFHD', 'RFHD', 'LBHD', 'RBHD']], axis=0)
    upper = unit(at('RELB') - at('RSHO'))
    lower = unit(wrist - at('RELB'))
    hand = unit(at('RFIN') - wrist)
    bend = np.degrees(np.arccos(np.clip(np.sum(upper * lower, axis=1), -1, 1)))
    elevation = np.degrees(np.arccos(np.clip(-upper[:, 1], -1, 1)))
    values = np.concatenate([upper, lower, hand, unit(shoulder - pelvis), unit(head - neck_proxy),
                             (pelvis - ankles) / proxy, (at('RSHO') - pelvis) / proxy,
                             bend[:, None], elevation[:, None]], axis=1)
    return values, basis, proxy


def derive_effort(values):
    raw = values[:, -1]
    residual = raw - np.linspace(raw[0], raw[-1], len(raw))
    if residual.max() < 15:
        raise ValueError('No full source arm-raise/extension excursion')
    if abs(raw[0] - raw[-1]) > 12:
        raise ValueError('Episode does not contain comparable observed rest endpoints; no fabricated lead-in')
    progress = np.clip(residual / residual.max(), 0, 1)
    peak = int(progress.argmax())
    progress[:peak + 1] = np.maximum.accumulate(progress[:peak + 1])
    progress[peak:] = np.maximum.accumulate(progress[peak:][::-1])[::-1]
    return np.round(progress, 7).tolist(), peak


def export():
    protocol = json.loads((RESEARCH / 'uiprmd-protocol.json').read_text(encoding='utf8'))
    if protocol['recording']['system'] != 'Vicon optical; 39 reflective markers' or protocol['recording']['fps'] != 100 or protocol['recording']['positionsUnit'] != 'millimeter':
        raise ValueError('Primary optical data metadata mismatch')
    names = protocol['recording']['markerNames']
    indices = {name: i for i, name in enumerate(names)}
    sources, clips, records = [], [], []
    for task, repetition in TRIALS:
        if protocol['tasks'][task]['sideForS01'] != 'right':
            raise ValueError('Unexpected source side')
        points, positions_path, angles_path = load_trial(task, repetition, names)
        values, basis, proxy = channels(points, indices)
        t = np.arange(len(values)) / 100
        target = np.linspace(t[0], t[-1], 121)
        sampled = np.stack([np.interp(target, t, values[:, i]) for i in range(len(CHANNELS))], axis=1)
        progress, peak = derive_effort(sampled)
        encoded_values = np.rint(sampled / STEPS)
        if np.max(np.abs(encoded_values)) > 32767:
            raise ValueError('Upper-body quantization range exceeded')
        encoded = encoded_values.astype('<i2').tobytes(order='C')
        errors = np.max(np.abs(encoded_values * STEPS - sampled), axis=0)
        if not np.all(errors <= STEPS / 2 + 1e-10):
            raise ValueError('Quantization error exceeded')
        source_id = f'uiprmd-vicon-{task}-s01-{repetition}'
        source = {'id': source_id, 'task': task, 'taskName': TASK_NAMES[task], 'subject': 's01',
                  'episode': repetition, 'capturedSide': 'right', 'fps': 100, 'sourceFrames': len(points),
                  'durationSeconds': float(t[-1]), 'sourceLoad': 'Unweighted rehabilitation movement; no dumbbell, cable or machine load.',
                  'sourceURL': ZIP_URL, 'positionsZIPEntry': f'Segmented Movements/Vicon/Positions/{positions_path.name}',
                  'anglesZIPEntry': f'Segmented Movements/Vicon/Angles/{angles_path.name}',
                  'positionsSHA256': sha(positions_path.read_bytes()), 'anglesSHA256': sha(angles_path.read_bytes()),
                  'restAnatomicalBasis': {'rightUpForwardColumns': basis.tolist(), 'determinant': float(np.linalg.det(basis)),
                                          'restFrames': [0, 9], 'sourceLegMarkerProxyMetres': proxy},
                  'sourceArmElevationMarkerDegrees': [float(sampled[0, -1]), float(sampled[:, -1].max()), float(sampled[-1, -1])]}
        sources.append(source)
        clip = {'id': source_id, 'task': task, 'sourceId': source_id, 'sampleCount': 121, 'stride': len(CHANNELS),
                'fps': 100, 'sourceFrames': len(points), 'firstSourceFrameIndex': 0, 'lastSourceFrameIndex': len(points) - 1,
                'startSeconds': 0, 'endSeconds': float(t[-1]), 'sourceDurationSeconds': float(t[-1]),
                'peakPhase': peak / 120, 'effortProgress': progress, 'capturedSide': 'right',
                'rawEndpointMaxAngleDifferenceDeg': float(np.max(np.abs(sampled[0, -2:] - sampled[-1, -2:]))),
                'encodedSHA256': sha(encoded)}
        clips.append({**clip, 'data': base64.b64encode(encoded).decode('ascii')})
        records.append({**clip, 'maxQuantizationErrorByChannel': errors.tolist(),
                        'rawPositionSliceSHA256': sha(np.asarray(points, dtype='<f8').tobytes(order='C')),
                        'rawPositionSliceSHAFormat': 'source mm positions divided by1000, float64 metres/C order, all39 markers/inclusive frames'})
    compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    generated = ('// Actual right-arm UI-PRMD Vicon optical references, unweighted; public/motions/ui-prmd-v018.json.\n'
                 + 'export const upperBodyChannelNames=' + compact(CHANNELS) + ';\n'
                 + 'export const upperBodyQuantization=' + compact(STEPS.tolist()) + ';\n'
                 + 'export const upperBodySources=' + compact(sources) + ';\n'
                 + 'export const upperBodyClips=' + compact(clips) + ';\n'
                 + "export function decodeUpperBodyClip(clip){const bytes=Uint8Array.from(atob(clip.data),c=>c.charCodeAt(0));if(clip.stride!==upperBodyChannelNames.length||bytes.length!==clip.sampleCount*clip.stride*2)throw Error('Invalid UI-PRMD profile');const v=new DataView(bytes.buffer),out=new Float32Array(bytes.length/2);for(let i=0;i<out.length;i++)out[i]=v.getInt16(i*2,true)*upperBodyQuantization[i%clip.stride];return out;}\n")
    manifest = {'schemaVersion': 1, 'dataset': 'UI-PRMD', 'sensor': 'Vicon optical', 'fps': 100,
                'sourcePositionUnit': 'millimeter', 'sourcePositionConversion': 'divide by1000 into metres before marker-based normalization',
                'sourceCoordinateScope': 'No global axes inferred; derive right/up/forward from initial ASIS,shoulder and foot-marker geometry.',
                'sourceMarkerNames': names, 'angleFileUse': 'Hashed and shape/finite-checked for source identity only. Vicon Euler angle order differs from marker order; no Euler/FK reconstruction performed.',
                'license': {'id': 'PDDL-1.0', 'url': 'https://opendatacommons.org/licenses/pddl/1-0/',
                            'officialStatementURL': 'https://www.idahofallshighered.org/vakanski/ui-prmd.html',
                            'archivedREADMEURL': 'https://zenodo.org/records/23104965/files/README.md?download=1',
                            'attribution': ATTRIBUTION, 'articleLicenseNotBasis': True},
                'primaryEvidenceSHA256': {name: sha((RESEARCH / name).read_bytes()) for name in ['uiprmd-readme.md', 'uiprmd-paper.xml', 'uiprmd-pddl.html', 'uiprmd-protocol.json']},
                'channels': CHANNELS, 'quantization': STEPS.tolist(),
                'filter': {'movingAverageRadius': 2, 'resampling': '121 inclusive points at100Hz source time',
                           'rawEndpoints': 'Observed endpoints retained, no synthetic lead-in or forced loop seam',
                           'derivedEffort': 'Marker upper-arm elevation, linear endpoint-baseline subtraction, excursion normalization, monotonic halves. Raw references remain distinct.'},
                'sources': sources, 'clips': records, 'actualEpisodes': 6, 'tasks': 3, 'sampledPoses': 726,
                'rejected': [{'id': 'm07_s01_e01', 'reason': 'Starts with arm already about49degrees elevated and ends about8degrees; missing rest lead-in.'},
                             {'id': 'm10_s01_e01', 'reason': 'Starts about24degrees elevated versus11degrees ending; e02/e03 provide more complete observed cycles.'},
                             {'id': 'm09', 'reason': 'Shoulder internal/external rotation, not biceps curl; no matching game application selected.'}],
                'runtimeData': {'path': 'src/upper-body-data-v018.js', 'bytes': len(generated.encode('utf8')), 'sha256': sha(generated.encode('utf8'))},
                'importerSHA256': sha(Path(__file__).read_bytes()),
                'scope': 'Source right-arm optical skin-marker directions and body references. Not clinical joint centres, source finger capture, weighted exercise capture, recorded bilateral movement or Kinect FK. Left-arm mirroring is an explicit game adaptation.',
                'professionalReview': {'status': 'pending', 'reviewer': None}}
    return generated, json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    generated, manifest = export()
    for path, contents in [(ROOT / 'src' / 'upper-body-data-v018.js', generated),
                           (ROOT / 'public' / 'motions' / 'ui-prmd-v018.json', manifest),
                           (ROOT / 'public' / 'motions' / 'ui-prmd-v018-ATTRIBUTION.txt', ATTRIBUTION + '\n')]:
        if args.verify:
            if path.read_text(encoding='utf8') != contents:
                raise ValueError('Generated source differs: ' + str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('w', encoding='utf8', newline='\n') as output:
                output.write(contents)
    print(json.dumps({'pass': True, 'episodes': 6, 'tasks': 3, 'sampledPoses': 726,
                      'runtimeBytes': len(generated.encode('utf8')), 'verifyOnly': args.verify}))


if __name__ == '__main__':
    main()
